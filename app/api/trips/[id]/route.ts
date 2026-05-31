import { NextRequest, NextResponse } from 'next/server';
import connectDB from "@/lib/mongodb";
import Trip from '@/models/Trip';
import FuelTracking from '@/models/FuelTracking';
import DriverBudget from '@/models/DriverBudget';
import Invoice from '@/models/Invoice';
import Income from '@/models/Income';
import Expense from '@/models/Expense';
import Attendance from '@/models/Attendance';
import Maintenance from '@/models/Maintenance';
import Transaction from '@/models/Transaction';
import Bank from '@/models/Bank';

// GET - Fetch single trip
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;

    const trip = await Trip.findById(id)
      .populate('driverId', 'name')
      .populate('vehicleId', 'vehicleNumber')
      .populate('createdBy', 'name');

    if (!trip) {
      return NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      );
    }

    // Normalize routeWiseExpenseBreakdown to include advanceAmount in API response
    const obj = trip.toObject();
    obj.routeWiseExpenseBreakdown = (obj.routeWiseExpenseBreakdown || []).map((route: any) => ({
      ...route,
      advanceAmount: Number(route?.advanceAmount ?? 0),
      advanceAmounts: Array.isArray(route?.advanceAmounts) ? route.advanceAmounts : [],
    }));
    return NextResponse.json(obj);
  } catch (error) {
    console.error('Error fetching trip:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trip' },
      { status: 500 }
    );
  }
}

// PUT - Update trip
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;

    const body = await request.json();
    const existingTrip = await Trip.findById(id);

    if (!existingTrip) {
      return NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      );
    }

    // Validate route-wise breakdown if present
    if (Array.isArray(body.routeWiseExpenseBreakdown)) {
      for (let i = 0; i < body.routeWiseExpenseBreakdown.length; i++) {
        const r = body.routeWiseExpenseBreakdown[i];
        const missing: string[] = [];
        if (!r.customerId) missing.push('customerId');
        if (!r.userId) missing.push('userId');
        if (!r.bankId) missing.push('bankId');
        if (!r.paymentType) missing.push('paymentType');
        if (!r.startLocation) missing.push('startLocation');
        if (!r.endLocation) missing.push('endLocation');
        if (!r.productName) missing.push('productName');
        if (r.weight === undefined || r.weight === null) missing.push('weight');
        if (r.rate === undefined || r.rate === null) missing.push('rate');
        if (missing.length) {
          return NextResponse.json(
            { error: `Route ${i + 1} missing: ${missing.join(', ')}` },
            { status: 400 }
          );
        }
      }
    }

    // Normalize per-route totalExpense and advanceAmount; compute trip totals if body provides routes
    if (Array.isArray(body.routeWiseExpenseBreakdown)) {
      body.routeWiseExpenseBreakdown = body.routeWiseExpenseBreakdown.map((route: any) => {
        const totalExpense = Array.isArray(route.expenses)
          ? route.expenses.reduce((sum: number, exp: any) => sum + (Number(exp.total) || 0), 0)
          : (route.totalExpense || 0);
        const advanceAmounts = Array.isArray(route?.advanceAmounts) ? route.advanceAmounts.map((a: any) => ({
          label: String(a?.label || ''),
          amount: Number(a?.amount || 0),
        })) : [];
        const advanceAmount = advanceAmounts.length > 0
          ? advanceAmounts.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0)
          : Number(route?.advanceAmount ?? 0);
        return { ...route, totalExpense, advanceAmount, advanceAmounts, paymentReceived: route?.paymentReceived ?? route?.paymentReceived };
      });
      const tripRouteCost = body.routeWiseExpenseBreakdown.reduce((sum: number, r: any) => sum + (Number(r.routeAmount) || 0), 0);
      const tripExpenses = body.routeWiseExpenseBreakdown.reduce((sum: number, r: any) => sum + (Number(r.totalExpense) || 0), 0);
      const dieselCost = body.tripDiselCost ?? existingTrip.tripDiselCost;
      body.tripRouteCost = tripRouteCost;
      body.tripExpenses = tripExpenses;
      body.remainingAmount = tripRouteCost - tripExpenses - (dieselCost || 0);
    }

    // If vehicle changed, recalculate fuel-related fields
    if (body.vehicleId !== existingTrip.vehicleId.toString()) {
      const latestFuelRecord = await FuelTracking.findOne({ vehicleId: body.vehicleId })
        .sort({ createdAt: -1 });

      if (latestFuelRecord) {
        const totalKm = body.endKm - body.startKm;
        body.fuelNeededForTrip = totalKm / (latestFuelRecord.truckAverage || 1);
        body.tripDiselCost = body.fuelNeededForTrip * (latestFuelRecord.fuelRate || 0);
        body.totalTripKm = totalKm;
      }
    }

    // Track previous completed routes
    const prevCompletedRoutes = (existingTrip.routeWiseExpenseBreakdown || []).some((r: any) => r.routeStatus === 'Completed');

    // Snapshot old routeAmount for each completed route BEFORE overwriting (for adjustment transaction)
    const oldRouteAmounts: Record<number, number> = {};
    (existingTrip.routeWiseExpenseBreakdown || []).forEach((r: any, idx: number) => {
      if (r.routeStatus === 'Completed') {
        oldRouteAmounts[idx] = Number(r.routeAmount || 0);
      }
    });

    // Snapshot old advanceAmount per routeNumber BEFORE mutation (for delta calculation on edit)
    const oldAdvancePerRoute: Record<number, number> = {};
    (existingTrip.routeWiseExpenseBreakdown || []).forEach((r: any) => {
      oldAdvancePerRoute[Number(r.routeNumber)] = Number(r.advanceAmount || 0);
    });

    // Cache old fuel value for delta calculation
    const oldFuelNeeded = existingTrip.fuelNeededForTrip || 0;

    // Capture old expenses BEFORE mutating existingTrip
    const oldRoutes = JSON.parse(JSON.stringify(existingTrip.routeWiseExpenseBreakdown || []));

    // Update trip using document.save() to ensure nested subdocuments persist reliably
    delete body.__v;
    existingTrip.set(body);
    await existingTrip.save();
    const updatedTrip = await Trip.findById(id);

    // Update driver budget ONLY if the total expense amount increased
    // Calculate total expenses before and after the update
    const newRoutes: any[] = body.routeWiseExpenseBreakdown || [];

    const getRouteExpensesTotal = (routes: any[]) => {
      let total = 0;
      for (const route of routes) {
        const expenses = route.expenses || [];
        total += expenses.reduce((sum: number, exp: any) => sum + (Number(exp.total) || 0), 0);
      }
      return total;
    };

    const oldTotalExpenses = getRouteExpensesTotal(oldRoutes);
    const newTotalExpenses = getRouteExpensesTotal(newRoutes);

    // Only deduct from budget if expenses increased
    const additionalExpenses = newTotalExpenses - oldTotalExpenses;

    const driverBudget = await DriverBudget.findOne({ driverId: body.driverId }).sort({ createdAt: -1 });

    if (driverBudget && additionalExpenses > 0) {
      const currentRemaining = typeof driverBudget.remainingBudgetAmount === 'number'
        ? driverBudget.remainingBudgetAmount
        : driverBudget.dailyBudgetAmount;
      const newRemainingBudget = currentRemaining - additionalExpenses;
      await DriverBudget.findByIdAndUpdate(driverBudget._id, { remainingBudgetAmount: newRemainingBudget });
    }

    // Update fuel quantity in fuel tracking - delta logic
    const newFuelNeeded = body.fuelNeededForTrip || 0;
    const fuelDelta = newFuelNeeded - oldFuelNeeded;

    if (fuelDelta !== 0) {
      const latestFuelRecord = await FuelTracking.findOne({ vehicleId: body.vehicleId }).sort({ createdAt: -1 });
      if (latestFuelRecord) {
        await FuelTracking.findByIdAndUpdate(latestFuelRecord._id, {
          $inc: { fuelQuantity: -fuelDelta }
        });
      }
    }

    // Per-route side effects based on routeStatus
    const nowCompletedRoutes = (updatedTrip.routeWiseExpenseBreakdown || []).some((r: any) => r.routeStatus === 'Completed');

    // Track next LR numbers (for NEW invoices)
    const nextLrMap = new Map<string, number>();

    for (const route of updatedTrip.routeWiseExpenseBreakdown) {
      // Find invoice by tripId + routeNumber (Reliable link)
      // OR fallback to old LR format if migration hasn't happened yet
      // OR by MongoDB _id (for invoices auto-generated during trip creation)
      let existingInvoice = await Invoice.findOne({
        $or: [
          { tripId: updatedTrip.tripId, routeNumber: route.routeNumber },
          { tripId: String(updatedTrip._id), routeNumber: route.routeNumber },
          { tripId: updatedTrip._id },
          { lrNo: `LR${updatedTrip.tripId}${route.routeNumber}` }
        ]
      });

      // LR prefix map (same as POST route and next-lr API)
      const LR_PREFIX_MAP: Record<string, string> = {
        'Riyaj Sayyad': 'RS',
        'Asif Sayyad': 'AS',
        'Rahiman Sayyad': 'RD',
        'Rehiman Sayyad': 'RD',
        'RDS Transport': 'RDS',
        'KGN Trading': 'KGN',
      };

      // If we need to create a NEW invoice, we must use sequential LR logic WITH correct prefix
      let finalLrNo = existingInvoice ? existingInvoice.lrNo : '';
      if (!existingInvoice) {
        // Resolve prefix from appUser name
        let lrPrefix = 'LR';
        const AppUser = (await import('@/models/AppUser')).default;
        const appUser = await AppUser.findById(route.userId);
        if (appUser && appUser.name) {
          lrPrefix = LR_PREFIX_MAP[appUser.name.trim()] || 'LR';
        }

        const userIdStr = String(route.userId);
        let nextLrVal = nextLrMap.get(userIdStr);
        if (nextLrVal === undefined) {
          const latestInvoice = await Invoice.findOne({
            lrNo: { $regex: new RegExp(`^${lrPrefix}\\d+$`) }
          }).sort({ lrNo: -1 });
          let currentMax = 0;
          if (latestInvoice && latestInvoice.lrNo) {
            const numericPart = latestInvoice.lrNo.replace(lrPrefix, '');
            const parsed = parseInt(numericPart, 10);
            if (!isNaN(parsed)) currentMax = parsed;
          }
          nextLrVal = currentMax + 1;
          nextLrMap.set(userIdStr, nextLrVal);
        } else {
          nextLrVal += 1;
          nextLrMap.set(userIdStr, nextLrVal);
        }
        finalLrNo = `${lrPrefix}${String(nextLrVal).padStart(5, '0')}`;
      }

      const advanceAmount = Number(route.advanceAmount || 0);
      const remainingAmount = Math.max(0, Number(route.routeAmount || 0) - advanceAmount);
      const routeAmount = Number(route.routeAmount || 0);
      // Invoice is "Paid" when: route is completed AND (no advance OR advance equals/exceeds route amount)
      // Invoice is "Unpaid" when: route is completed AND advance is partial (0 < advance < routeAmount)
      const desiredInvoiceStatus = route.routeStatus === 'Completed'
        ? (advanceAmount > 0 && advanceAmount < routeAmount ? 'Unpaid' : 'Paid')
        : 'Unpaid';
      const paymentReceived = route.paymentReceived === 'driver' ? 'driver' : 'appuser';
      const CREDIT_MARKER = '[ADVANCE_CREDITED_TO_DRIVER]';

      // Persist the locations array/list from the frontend
      const locations = Array.isArray(route.locations) ? route.locations : [];
      // Determine Start/End for Invoice: Filter by 'filled' status
      const filledLocations = locations.filter((l: any) => l.status === 'filled');
      const invoiceStartLocation = filledLocations.length > 0 ? filledLocations[0].from : route.startLocation;
      const invoiceEndLocation = filledLocations.length > 0 ? filledLocations[filledLocations.length - 1].to : route.endLocation;

      // Ensure invoice exists and mirrors route status
      if (existingInvoice) {
        let updated = false;
        if (existingInvoice.status !== desiredInvoiceStatus) { existingInvoice.status = desiredInvoiceStatus; updated = true; }
        if (existingInvoice.advanceAmount !== advanceAmount) { (existingInvoice as any).advanceAmount = advanceAmount; updated = true; }
        // Sync advanceAmounts array
        const routeAdvanceAmounts = Array.isArray(route.advanceAmounts) ? route.advanceAmounts : [];
        (existingInvoice as any).advanceAmounts = routeAdvanceAmounts;
        updated = true;
        if (existingInvoice.remainingAmount !== remainingAmount) { (existingInvoice as any).remainingAmount = remainingAmount; updated = true; }
        if (existingInvoice.from !== invoiceStartLocation) { existingInvoice.from = invoiceStartLocation; updated = true; }
        if (existingInvoice.to !== invoiceEndLocation) { existingInvoice.to = invoiceEndLocation; updated = true; }
        if (existingInvoice.customerName !== route.customerName) { existingInvoice.customerName = route.customerName; updated = true; }
        if (existingInvoice.total !== route.routeAmount) { existingInvoice.total = route.routeAmount; updated = true; }

        // Ensure tripId/routeNumber are linked
        if (!existingInvoice.tripId) { (existingInvoice as any).tripId = updatedTrip.tripId; updated = true; }
        if (existingInvoice.routeNumber !== route.routeNumber) { (existingInvoice as any).routeNumber = route.routeNumber; updated = true; }
        if (String((existingInvoice as any).bankId || '') !== String(route.bankId || '')) { (existingInvoice as any).bankId = route.bankId; updated = true; }

        if (paymentReceived === 'driver' && advanceAmount > 0) {
          const hasMarker = (existingInvoice as any).remarks?.includes(CREDIT_MARKER);
          if (!hasMarker) {
            (existingInvoice as any).remarks = `${(existingInvoice as any).remarks || ''} ${CREDIT_MARKER}`.trim();
            updated = true;
          }
        }

        const baseRow = route.productName
          ? [{
            product: route.productName,
            truckNo: updatedTrip.vehicleNumber,
            weight: route.weight,
            rate: route.rate,
            total: Number(route.rate || 0) * Number(route.weight || 0),
            articles: String((route as any).chalanNo || '')
          }]
          : [];
        const extraRows = (Array.isArray((route as any).rows) ? (route as any).rows : []).map((row: any) => ({
          product: row.productName,
          truckNo: updatedTrip.vehicleNumber,
          weight: Number(row.weight || 0),
          rate: Number(row.rate || 0),
          total: Number(row.total || (Number(row.rate || 0) * Number(row.weight || 0))),
          articles: String(row.chalanNo || '')
        }));
        const nextRows = [...baseRow, ...extraRows];
        if (nextRows.length > 0) {
          (existingInvoice as any).rows = nextRows;
          updated = true;
        }

        if (updated) {
          await existingInvoice.save();
        }
      } else {
        await Invoice.updateOne(
          { lrNo: finalLrNo },
          {
            $set: {
              date: (route?.dates && route.dates[0]) ? route.dates[0] : ((updatedTrip.date && updatedTrip.date[0]) ? updatedTrip.date[0] : new Date()),
              from: invoiceStartLocation,
              to: invoiceEndLocation,
              customerName: route.customerName,
              lrNo: finalLrNo,
              tripId: updatedTrip.tripId,
              routeNumber: route.routeNumber,
              rows: [
                ...(route.productName
                  ? [{
                    product: route.productName,
                    truckNo: updatedTrip.vehicleNumber,
                    weight: route.weight,
                    rate: route.rate,
                    total: Number(route.rate || 0) * Number(route.weight || 0),
                    articles: String((route as any).chalanNo || ''),
                  }]
                  : []),
                ...((Array.isArray((route as any).rows) ? (route as any).rows : []).map((row: any) => ({
                  product: row.productName,
                  truckNo: updatedTrip.vehicleNumber,
                  weight: Number(row.weight || 0),
                  rate: Number(row.rate || 0),
                  total: Number(row.total || (Number(row.rate || 0) * Number(row.weight || 0))),
                  articles: String(row.chalanNo || ''),
                })))
              ],
              total: route.routeAmount,
              advanceAmount,
              remainingAmount,
              appUserId: route.userId,
              bankId: route.bankId,
              status: desiredInvoiceStatus,
              remarks: paymentReceived === 'driver' && advanceAmount > 0 ? CREDIT_MARKER : '',
              advanceAmounts: Array.isArray(route.advanceAmounts) ? route.advanceAmounts : [],
            }
          },
          { upsert: true }
        );
      }

      // When a route is completed: if app user received payment, generate income/transactions/bank update; ONLY if there's NO advance (advanceAmount === 0).
      // Advance transactions are naturally handled manually in the UI immediately upon entry.
      if (route.routeStatus === 'Completed' && paymentReceived !== 'driver' && advanceAmount === 0) {
        const incomeAmount = Number(route.routeAmount || 0);
        const incomeDesc = `Income from trip ${updatedTrip.tripId} - Route ${route.routeNumber}`;

        // Create Income record if it doesn't already exist
        let income = await Income.findOne({
          appUserId: route.userId,
          date: (route?.dates && route.dates[0]) ? route.dates[0] : ((updatedTrip.date && updatedTrip.date[0]) ? updatedTrip.date[0] : new Date()),
          category: 'Trip Income',
          description: incomeDesc,
          bankId: route.bankId
        });

        if (!income) {
          income = await Income.create({
            appUserId: route.userId,
            date: (route?.dates && route.dates[0]) ? route.dates[0] : ((updatedTrip.date && updatedTrip.date[0]) ? updatedTrip.date[0] : new Date()),
            category: 'Trip Income',
            amount: incomeAmount,
            description: incomeDesc,
            bankId: route.bankId
          });
        }

        // Create INCOME transaction if missing
        const existingIncomeTxn = await Transaction.findOne({
          type: 'INCOME',
          description: incomeDesc,
          toBankId: route.bankId,
          appUserId: route.userId,
          relatedEntityType: 'Income',
          relatedEntityId: income._id
        });

        if (!existingIncomeTxn) {
          let transactionCount = await Transaction.countDocuments();
          const transactionId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;

          const bank = await Bank.findById(route.bankId);
          const balanceAfterIncome = (bank?.balance || 0) + incomeAmount;

          await Transaction.create({
            transactionId,
            type: 'INCOME',
            description: incomeDesc,
            amount: incomeAmount,
            toBankId: route.bankId,
            appUserId: route.userId,
            relatedEntityId: income._id,
            relatedEntityType: 'Income',
            category: 'Trip Income',
            status: 'COMPLETED',
            balanceAfter: balanceAfterIncome,
            date: (route?.dates && route.dates[0]) ? route.dates[0] : ((updatedTrip.date && updatedTrip.date[0]) ? updatedTrip.date[0] : new Date())
          });
        }

        // Create Bank update transaction and update bank balance if missing
        const bankUpdateDesc = `Bank balance update for trip ${updatedTrip.tripId} - Route ${route.routeNumber}`;

        const existingBankUpdateTxn = await Transaction.findOne({
          type: 'BANK_UPDATE',
          description: bankUpdateDesc,
          toBankId: route.bankId,
          appUserId: route.userId,
          relatedEntityType: 'Bank',
          relatedEntityId: route.bankId
        });

        if (!existingBankUpdateTxn) {
          await Bank.findByIdAndUpdate(route.bankId, {
            $inc: { balance: incomeAmount }
          });

          let transactionCount = await Transaction.countDocuments();
          const bankTransactionId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;

          const updatedBank = await Bank.findById(route.bankId);

          await Transaction.create({
            transactionId: bankTransactionId,
            type: 'BANK_UPDATE',
            description: bankUpdateDesc,
            amount: incomeAmount,
            toBankId: route.bankId,
            appUserId: route.userId,
            relatedEntityId: route.bankId,
            relatedEntityType: 'Bank',
            category: 'Bank Update',
            status: 'COMPLETED',
            balanceAfter: updatedBank?.balance || undefined,
            date: (route?.dates && route.dates[0]) ? route.dates[0] : ((updatedTrip.date && updatedTrip.date[0]) ? updatedTrip.date[0] : new Date())
          });
        }

        const oldRoute = oldRoutes.find((r: any) => Number(r.routeNumber) === Number(route.routeNumber));
        const oldRouteAmount = Number(oldRoute?.routeAmount || 0);
        const oldAdvance = Number(oldRoute?.advanceAmount || 0);
        const oldEffectiveIncome = oldAdvance > 0 ? oldAdvance : oldRouteAmount;
        const newEffectiveIncome = advanceAmount > 0 ? advanceAmount : Number(route.routeAmount || 0);
        const incomeDelta = newEffectiveIncome - oldEffectiveIncome;

        if (incomeDelta !== 0) {
          const oldIncomeDesc = oldAdvance > 0
            ? `Advance income from trip ${updatedTrip.tripId} - Route ${route.routeNumber}`
            : `Income from trip ${updatedTrip.tripId} - Route ${route.routeNumber}`;
          const newIncomeDesc = advanceAmount > 0
            ? `Advance income from trip ${updatedTrip.tripId} - Route ${route.routeNumber}`
            : `Income from trip ${updatedTrip.tripId} - Route ${route.routeNumber}`;

          let incomeDoc = await Income.findOne({
            appUserId: route.userId,
            bankId: route.bankId,
            description: oldIncomeDesc
          });

          if (!incomeDoc) {
            incomeDoc = await Income.findOne({
              appUserId: route.userId,
              bankId: route.bankId,
              description: newIncomeDesc
            });
          }

          if (incomeDoc) {
            incomeDoc.amount = Number(incomeDoc.amount || 0) + incomeDelta;
            incomeDoc.description = newIncomeDesc;
            await incomeDoc.save();

            await Transaction.findOneAndUpdate(
              {
                type: 'INCOME',
                relatedEntityType: 'Income',
                relatedEntityId: incomeDoc._id
              },
              {
                $inc: { amount: incomeDelta },
                description: newIncomeDesc
              }
            );
          } else {
            incomeDoc = await Income.create({
              appUserId: route.userId,
              date: (route?.dates && route.dates[0]) ? route.dates[0] : ((updatedTrip.date && updatedTrip.date[0]) ? updatedTrip.date[0] : new Date()),
              category: 'Trip Income',
              amount: newEffectiveIncome,
              description: newIncomeDesc,
              bankId: route.bankId
            });
          }

          await Bank.findByIdAndUpdate(route.bankId, { $inc: { balance: incomeDelta } });
          const bankAfterAdvanceAdjustment = await Bank.findById(route.bankId);

          let transactionCount = await Transaction.countDocuments();
          const incomeAdjTxnId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;
          await Transaction.create({
            transactionId: incomeAdjTxnId,
            type: incomeDelta >= 0 ? 'INCOME' : 'EXPENSE',
            description: `Advance adjustment for trip ${updatedTrip.tripId} - Route ${route.routeNumber} (${oldAdvance} → ${advanceAmount})`,
            amount: Math.abs(incomeDelta),
            toBankId: incomeDelta >= 0 ? route.bankId : undefined,
            fromBankId: incomeDelta < 0 ? route.bankId : undefined,
            appUserId: route.userId,
            relatedEntityType: 'Income',
            relatedEntityId: incomeDoc?._id || undefined,
            category: 'Advance Adjustment',
            status: 'COMPLETED',
            balanceAfter: bankAfterAdvanceAdjustment?.balance ?? undefined,
            date: (route?.dates && route.dates[0]) ? route.dates[0] : ((updatedTrip.date && updatedTrip.date[0]) ? updatedTrip.date[0] : new Date())
          });

          transactionCount = await Transaction.countDocuments();
          const bankAdjTxnId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;
          await Transaction.create({
            transactionId: bankAdjTxnId,
            type: 'BANK_UPDATE',
            description: `Bank balance advance adjustment for trip ${updatedTrip.tripId} - Route ${route.routeNumber}`,
            amount: Math.abs(incomeDelta),
            toBankId: incomeDelta >= 0 ? route.bankId : undefined,
            fromBankId: incomeDelta < 0 ? route.bankId : undefined,
            appUserId: route.userId,
            relatedEntityId: route.bankId,
            relatedEntityType: 'Bank',
            category: 'Bank Update',
            status: 'COMPLETED',
            balanceAfter: bankAfterAdvanceAdjustment?.balance ?? undefined,
            date: (route?.dates && route.dates[0]) ? route.dates[0] : ((updatedTrip.date && updatedTrip.date[0]) ? updatedTrip.date[0] : new Date())
          });
        }
      } else if (route.routeStatus === 'Completed' && paymentReceived === 'driver') {
        // Driver advance is now explicitly handled via the manual 'Add Advance Amount' button in the UI.
        // We skip automatically crediting the driver budget here to prevent duplicate transactions.
      }
    }

    // --- Route Amount Change Adjustments: create transaction history when completed route amount changes ---
    for (let routeIdx = 0; routeIdx < updatedTrip.routeWiseExpenseBreakdown.length; routeIdx++) {
      const route = updatedTrip.routeWiseExpenseBreakdown[routeIdx];
      const paymentReceived = route.paymentReceived === 'driver' ? 'driver' : 'appuser';

      const oldAdvanceForCurrentRoute = Number((oldRoutes.find((r: any) => Number(r.routeNumber) === Number(route.routeNumber))?.advanceAmount) || 0);
      const newAdvanceForCurrentRoute = Number(route.advanceAmount || 0);
      if (route.routeStatus === 'Completed' && paymentReceived !== 'driver' && oldAdvanceForCurrentRoute === 0 && newAdvanceForCurrentRoute === 0) {
        const oldAmount = oldRouteAmounts[routeIdx];
        const newAmount = Number(route.routeAmount || 0);

        // Only act if we had a previous completed amount and it changed
        if (oldAmount !== undefined && oldAmount !== newAmount) {
          const amountDelta = newAmount - oldAmount;
          const routeDate = (route?.dates && route.dates[0])
            ? route.dates[0]
            : ((updatedTrip.date && updatedTrip.date[0]) ? updatedTrip.date[0] : new Date());
          const adjustmentDesc = `Route amount adjustment for trip ${updatedTrip.tripId} - Route ${route.routeNumber} (${oldAmount} → ${newAmount})`;

          // Update bank balance by the delta
          await Bank.findByIdAndUpdate(route.bankId, { $inc: { balance: amountDelta } });
          const bankAfterAdj = await Bank.findById(route.bankId);

          // Update the existing Income record's amount
          const incomeDesc = Number(route.advanceAmount || 0) > 0
            ? `Advance income from trip ${updatedTrip.tripId} - Route ${route.routeNumber}`
            : `Income from trip ${updatedTrip.tripId} - Route ${route.routeNumber}`;
          await Income.findOneAndUpdate(
            { description: incomeDesc, appUserId: route.userId, bankId: route.bankId },
            { $inc: { amount: amountDelta } }
          );

          // Create ADJUSTMENT transaction
          const txnCount = await Transaction.countDocuments();
          const adjTxnId = `TXN${new Date().getFullYear()}${String(txnCount + 1).padStart(6, '0')}`;
          await Transaction.create({
            transactionId: adjTxnId,
            type: amountDelta >= 0 ? 'INCOME' : 'EXPENSE',
            description: adjustmentDesc,
            amount: Math.abs(amountDelta),
            toBankId: amountDelta >= 0 ? route.bankId : undefined,
            fromBankId: amountDelta < 0 ? route.bankId : undefined,
            appUserId: route.userId,
            relatedEntityType: 'Trip',
            relatedEntityId: updatedTrip._id,
            category: 'Route Amount Adjustment',
            status: 'COMPLETED',
            balanceAfter: bankAfterAdj?.balance ?? undefined,
            date: routeDate
          });
        }
      }

      // --- App User Expenses Updates ---
      const oldRoute = oldRoutes.find((r: any) => r.routeNumber === route.routeNumber);
      const oldAppUserExpenses = oldRoute ? (Array.isArray(oldRoute.appUserExpenses) ? oldRoute.appUserExpenses : []) : [];
      const newAppUserExpenses = Array.isArray(route.appUserExpenses) ? route.appUserExpenses : [];

      if (route.routeStatus === 'In Progress' || route.routeStatus === 'Completed') {
        let modifiedAppExpenses = false;
        
        for (const appExp of newAppUserExpenses) {
          const amount = Number(appExp?.amount ?? 0);
          const appUserId = appExp?.appUserId || route.userId;
          const bankId = appExp?.bankId || route.bankId;
          const category = appExp?.category || 'Trip Expense';
          const description = appExp?.description || `App User Expense from trip ${updatedTrip.tripId} - Route ${route.routeNumber}`;
          const expenseDate = (route?.dates && route.dates[0]) ? route.dates[0] : ((updatedTrip.date && updatedTrip.date[0]) ? updatedTrip.date[0] : new Date());

          if (!appUserId || !bankId || amount <= 0) continue;

          if (!appExp.expenseId) {
            // NEW App User Expense
            const expense = await Expense.create({
              appUserId,
              bankId,
              category,
              amount,
              description,
              date: expenseDate,
            });

            appExp.expenseId = expense._id;
            modifiedAppExpenses = true;

            const currentBank = await Bank.findById(bankId);
            const balanceAfter = (currentBank?.balance || 0) - amount;
            await Bank.findByIdAndUpdate(bankId, { $inc: { balance: -amount } });

            let transactionCount = await Transaction.countDocuments();
            const transactionId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;
            const transaction = await Transaction.create({
              transactionId,
              type: 'EXPENSE',
              description,
              amount,
              fromBankId: bankId,
              appUserId,
              relatedEntityId: expense._id,
              relatedEntityType: 'Expense',
              category,
              status: 'COMPLETED',
              balanceAfter,
              date: expenseDate,
            });
            await Expense.findByIdAndUpdate(expense._id, { transactionId: transaction._id });
          } else {
            // EXISTING App User Expense - check for changes
            const oldExp = oldAppUserExpenses.find((e: any) => String(e.expenseId) === String(appExp.expenseId));
            if (oldExp) {
              const oldAmount = Number(oldExp.amount || 0);
              const oldBankId = String(oldExp.bankId || route.bankId);
              const oldAppUserId = String(oldExp.appUserId || route.userId);

              if (oldAmount !== amount || oldBankId !== String(bankId) || oldAppUserId !== String(appUserId)) {
                // Restore old bank balance
                await Bank.findByIdAndUpdate(oldBankId, { $inc: { balance: oldAmount } });
                
                // Deduct from new bank balance
                await Bank.findByIdAndUpdate(bankId, { $inc: { balance: -amount } });
                const currentBank = await Bank.findById(bankId);
                const balanceAfter = currentBank?.balance || 0;

                // Update Expense
                await Expense.findByIdAndUpdate(appExp.expenseId, {
                  appUserId,
                  bankId,
                  amount,
                  description,
                  category,
                  date: expenseDate
                });

                // Update Transaction
                await Transaction.findOneAndUpdate(
                  { relatedEntityId: appExp.expenseId, relatedEntityType: 'Expense' },
                  {
                    amount,
                    fromBankId: bankId,
                    appUserId,
                    description,
                    category,
                    balanceAfter,
                    date: expenseDate
                  }
                );
              }
            }
          }
        }

        // Check for DELETED App User Expenses
        for (const oldExp of oldAppUserExpenses) {
          if (oldExp.expenseId && !newAppUserExpenses.some((e: any) => String(e.expenseId) === String(oldExp.expenseId))) {
            const oldAmount = Number(oldExp.amount || 0);
            const oldBankId = String(oldExp.bankId || route.bankId);
            
            // Restore bank balance
            await Bank.findByIdAndUpdate(oldBankId, { $inc: { balance: oldAmount } });
            
            // Delete Expense and Transaction
            await Expense.findByIdAndDelete(oldExp.expenseId);
            await Transaction.findOneAndDelete({ relatedEntityId: oldExp.expenseId, relatedEntityType: 'Expense' });
          }
        }

        if (modifiedAppExpenses) {
          await Trip.updateOne(
            { _id: updatedTrip._id, 'routeWiseExpenseBreakdown.routeNumber': route.routeNumber },
            { $set: { 'routeWiseExpenseBreakdown.$.appUserExpenses': newAppUserExpenses } }
          );
        }
      } else {
        // If route is Draft or Cancelled, remove any associated App User Expenses from DB and Bank
        let modifiedAppExpenses = false;
        for (const oldExp of oldAppUserExpenses) {
          if (oldExp.expenseId) {
            const oldAmount = Number(oldExp.amount || 0);
            const oldBankId = String(oldExp.bankId || route.bankId);
            
            // Restore bank balance
            await Bank.findByIdAndUpdate(oldBankId, { $inc: { balance: oldAmount } });
            
            // Delete Expense and Transaction
            await Expense.findByIdAndDelete(oldExp.expenseId);
            await Transaction.findOneAndDelete({ relatedEntityId: oldExp.expenseId, relatedEntityType: 'Expense' });
          }
        }
        
        for (const appExp of newAppUserExpenses) {
          if (appExp.expenseId) {
            appExp.expenseId = undefined;
            modifiedAppExpenses = true;
          }
        }

        if (modifiedAppExpenses) {
          await Trip.updateOne(
            { _id: updatedTrip._id, 'routeWiseExpenseBreakdown.routeNumber': route.routeNumber },
            { $set: { 'routeWiseExpenseBreakdown.$.appUserExpenses': newAppUserExpenses } }
          );
        }
      }
    }


    if (!prevCompletedRoutes && nowCompletedRoutes) {
      for (const date of updatedTrip.date) {
        const existingAttendance = await Attendance.findOne({
          driverId: updatedTrip.driverId,
          date: new Date(date)
        });

        if (!existingAttendance) {
          await Attendance.create({
            driverId: updatedTrip.driverId,
            driverName: updatedTrip.driverName,
            date: new Date(date),
            status: 'Present',
            tripId: updatedTrip._id,
            tripNumber: updatedTrip.tripId,
            remarks: 'On Trip',
            createdBy: updatedTrip.createdBy
          });
        }
      }

      // Update maintenance km tracking when trip first has a completed route
      await updateMaintenanceKmTracking(updatedTrip.vehicleId, updatedTrip.endKm);
    }

    return NextResponse.json(updatedTrip);
  } catch (error) {
    console.error('Error updating trip:', error);
    return NextResponse.json(
      { error: 'Failed to update trip' },
      { status: 500 }
    );
  }
}

// DELETE - Delete trip
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;

    const trip = await Trip.findById(id);

    if (!trip) {
      return NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      );
    }

    // If trip was completed, remove related records
    if (trip.status === 'Completed') {
      await removeCompletedTripRecords(trip);
    }

    // Restore fuel quantity
    const latestFuelRecord = await FuelTracking.findOne({ vehicleId: trip.vehicleId })
      .sort({ createdAt: -1 });

    if (latestFuelRecord) {
      await FuelTracking.findByIdAndUpdate(latestFuelRecord._id, {
        $inc: { fuelQuantity: trip.fuelNeededForTrip }
      });
    }

    // Restore driver budget
    const driverBudget = await DriverBudget.findOne({ driverId: trip.driverId });
    if (driverBudget) {
      const nonDriverAllowanceExpenses = trip.routeWiseExpenseBreakdown.reduce((sum: number, route: any) => {
        return sum + route.expenses.reduce((expSum: number, exp: any) => {
          return exp.category !== 'Driver Allowance' ? expSum + exp.total : expSum;
        }, 0);
      }, 0);

      await DriverBudget.findByIdAndUpdate(driverBudget._id, {
        $inc: { remainingBudgetAmount: nonDriverAllowanceExpenses }
      });
    }

    await Trip.findByIdAndDelete(id);

    return NextResponse.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Error deleting trip:', error);
    return NextResponse.json(
      { error: 'Failed to delete trip' },
      { status: 500 }
    );
  }
}

// Helper functions
async function createCompletedTripRecords(trip: any) {
  try {
    // Create attendance records for each trip date
    for (const date of trip.date) {
      const existingAttendance = await Attendance.findOne({
        driverId: trip.driverId,
        date: new Date(date)
      });

      if (!existingAttendance) {
        await Attendance.create({
          driverId: trip.driverId,
          driverName: trip.driverName,
          date: new Date(date),
          status: 'Present',
          tripId: trip._id,
          tripNumber: trip.tripId,
          remarks: 'On Trip',
          createdBy: trip.createdBy
        });
      }
    }

    // For each route: update or create invoice reflecting advance, then create income and transactions
    for (const route of trip.routeWiseExpenseBreakdown) {
      const lrNo = `LR${trip.tripId}${route.routeNumber}`;

      // Try to find existing invoice created during trip creation
      const existingInvoice = await Invoice.findOne({ lrNo });
      const advanceAmount = Number(route.advanceAmount || 0);
      const remainingAmount = Math.max(0, Number(route.routeAmount || 0) - advanceAmount);
      const isAdvance = advanceAmount > 0;

      if (existingInvoice) {
        // Update invoice with advance and remaining; set status based on advance
        (existingInvoice as any).advanceAmount = advanceAmount;
        (existingInvoice as any).remainingAmount = remainingAmount;
        existingInvoice.status = isAdvance ? 'Unpaid' : 'Paid';
        await existingInvoice.save();
      } else {
        // Upsert a new invoice with advance and status based on advance
        await Invoice.updateOne(
          { lrNo },
          {
            $set: {
              date: trip.date[0],
              from: route.startLocation,
              to: route.endLocation,
              customerName: route.customerName,
              lrNo,
              rows: [{
                product: route.productName,
                truckNo: trip.vehicleNumber,
                weight: route.weight,
                rate: route.rate,
                total: route.routeAmount
              }],
              total: route.routeAmount,
              advanceAmount,
              remainingAmount,
              status: isAdvance ? 'Unpaid' : 'Paid'
            }
          },
          { upsert: true }
        );
      }

      // Create Income record
      const income = await Income.create({
        appUserId: route.userId,
        date: trip.date[0],
        category: 'Trip Income',
        amount: isAdvance ? advanceAmount : Number(route.routeAmount || 0),
        description: isAdvance
          ? `Advance income from trip ${trip.tripId} - Route ${route.routeNumber}`
          : `Income from trip ${trip.tripId} - Route ${route.routeNumber}`,
        bankId: route.bankId
      });

      // Create Transaction record for income
      let transactionCount = await Transaction.countDocuments();
      const transactionId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;

      // Get current bank balance before update
      const bank = await Bank.findById(route.bankId);
      const incomeAmount = isAdvance ? advanceAmount : Number(route.routeAmount || 0);
      const balanceAfterIncome = (bank?.balance || 0) + incomeAmount;

      await Transaction.create({
        transactionId,
        type: 'INCOME',
        description: isAdvance
          ? `Advance income from trip ${trip.tripId} - Route ${route.routeNumber}`
          : `Income from trip ${trip.tripId} - Route ${route.routeNumber}`,
        amount: incomeAmount,
        toBankId: route.bankId,
        appUserId: route.userId,
        relatedEntityId: income._id,
        relatedEntityType: 'Income',
        category: 'Trip Income',
        status: 'COMPLETED',
        balanceAfter: balanceAfterIncome,
        date: trip.date[0]
      });

      // Update bank balance and log bank update transaction
      await Bank.findByIdAndUpdate(route.bankId, {
        $inc: { balance: incomeAmount }
      });

      transactionCount = await Transaction.countDocuments();
      const bankTransactionId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;

      const updatedBank = await Bank.findById(route.bankId);

      await Transaction.create({
        transactionId: bankTransactionId,
        type: 'BANK_UPDATE',
        description: `Bank balance update for trip ${trip.tripId} - Route ${route.routeNumber}`,
        amount: incomeAmount,
        toBankId: route.bankId,
        appUserId: route.userId,
        relatedEntityId: route.bankId,
        relatedEntityType: 'Bank',
        category: 'Bank Update',
        status: 'COMPLETED',
        balanceAfter: updatedBank?.balance || balanceAfterIncome,
        date: trip.date[0]
      });
    }
  } catch (error) {
    console.error('Error creating completed trip records:', error);
    throw error;
  }
}

async function removeCompletedTripRecords(trip: any) {
  try {
    // Remove attendance records
    await Attendance.deleteMany({
      tripId: trip._id
    });

    // Remove invoices, income, and expense records
    await Invoice.deleteMany({ tripId: trip._id });
    await Income.deleteMany({ tripId: trip._id });
    await Expense.deleteMany({ tripId: trip._id });
  } catch (error) {
    console.error('Error removing completed trip records:', error);
    throw error;
  }
}

// Helper function to update maintenance km tracking
async function updateMaintenanceKmTracking(vehicleId: string, endKm: number) {
  try {
    // Find all pending maintenance records for this vehicle
    const maintenanceRecords = await Maintenance.find({
      vehicleId: vehicleId,
      isCompleted: false,
      status: { $in: ['Pending', 'Due', 'Overdue'] }
    });

    // Update each maintenance record with new end km and calculate status
    for (const maintenance of maintenanceRecords) {
      const totalKm = endKm - maintenance.startKm;
      let status = 'Pending';

      if (totalKm >= maintenance.targetKm) {
        status = 'Due';
      }

      // Update the maintenance record
      await Maintenance.findByIdAndUpdate(maintenance._id, {
        endKm: endKm,
        status: status,
        isNotificationSent: status === 'Due' ? false : maintenance.isNotificationSent
      });
    }
  } catch (error) {
    console.error('Error updating maintenance km tracking:', error);
    throw error;
  }
}
