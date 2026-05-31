import { NextRequest, NextResponse } from 'next/server';
import connectDB from "@/lib/mongodb";
import Trip from '@/models/Trip';
import Driver from '@/models/Driver';
import Vehicle from '@/models/Vehicle';
import Customer from '@/models/Customer';
import Bank from '@/models/Bank';
import FuelTracking from '@/models/FuelTracking';
import DriverBudget from '@/models/DriverBudget';
import Invoice from '@/models/Invoice';
import Income from '@/models/Income';
import Attendance from '@/models/Attendance';
import Transaction from '@/models/Transaction';
import AppUser from '@/models/AppUser';
import Expense from '@/models/Expense';

// Parse date string strictly as local date (start of day)
function parseLocalDateParam(input: string | null): Date | null {
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) { // ISO from <input type="date">
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(input)) { // DD/MM/YYYY
    const [d, m, y] = input.split('/').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const dObj = new Date(input);
  return isNaN(dObj.getTime()) ? null : dObj;
}

// GET - Fetch all trips
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    // If limit is 0, we treat it as "all" (no limit)
    const limitParam = parseInt(searchParams.get('limit') || '10');
    const limit = limitParam === 0 ? 0 : limitParam;
    const status = searchParams.get('status');
    const driverId = searchParams.get('driverId');
    const vehicleId = searchParams.get('vehicleId');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');

    // Only apply skip if we are paginating (limit > 0)
    const skip = limit > 0 ? (page - 1) * limit : 0;

    // Build filter object
    const filter: any = {};
    if (status && status !== 'all') filter.status = status;
    if (driverId) filter.driverId = driverId;
    if (vehicleId) filter.vehicleId = vehicleId;

    // Date range filtering aligned with Invoice logic: filter by primary trip date
    const dateRange: any = {};
    const start = parseLocalDateParam(fromDate);
    const endStart = parseLocalDateParam(toDate);
    if (start) {
      dateRange.$gte = start;
    }
    if (endStart) {
      const end = new Date(endStart.getFullYear(), endStart.getMonth(), endStart.getDate(), 23, 59, 59, 999);
      dateRange.$lte = end;
    }
    if (Object.keys(dateRange).length) {
      // Filter using the first trip date element to prevent including earlier months
      filter['date.0'] = dateRange;
    }

    const trips = await Trip.find(filter)
      .populate('driverId', 'name')
      .populate('vehicleId', 'vehicleNumber')
      .populate('createdBy', 'name')
      .populate('routeWiseExpenseBreakdown.bankId', 'name')
      .populate('routeWiseExpenseBreakdown.customerId', 'name')
      .populate('routeWiseExpenseBreakdown.userId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Ensure each route includes advanceAmount in the API response (default to 0 if missing)
    const normalizedTrips = trips.map((t) => {
      const obj = t.toObject();
      obj.routeWiseExpenseBreakdown = (obj.routeWiseExpenseBreakdown || []).map((route: any) => ({
        ...route,
        advanceAmount: Number(route?.advanceAmount ?? 0),
        advanceAmounts: Array.isArray(route?.advanceAmounts) ? route.advanceAmounts : [],
      }));
      return obj;
    });

    const total = await Trip.countDocuments(filter);

    return NextResponse.json({
      trips: normalizedTrips,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching trips:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trips' },
      { status: 500 }
    );
  }
}

// POST - Create new trip
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();

    // Normalize each route: coerce numeric fields, compute totals, and ensure advanceAmount persists
    if (Array.isArray(body.routeWiseExpenseBreakdown)) {
      body.routeWiseExpenseBreakdown = body.routeWiseExpenseBreakdown.map((route: any) => {
        const expenses = Array.isArray(route.expenses)
          ? route.expenses.map((exp: any) => ({
            ...exp,
            amount: Number(exp?.amount ?? 0),
            quantity: Number(exp?.quantity ?? 0),
            total: Number(exp?.total ?? 0),
          }))
          : [];
        const totalExpense = expenses.reduce((sum: number, exp: any) => sum + (Number(exp.total) || 0), 0);
        const weight = Number(route?.weight ?? 0);
        const rate = Number(route?.rate ?? 0);
        const baseAmount = Number(rate * weight);
        const rows = Array.isArray(route?.rows)
          ? route.rows.map((row: any) => ({
            productName: String(row?.productName || ''),
            weight: Number(row?.weight || 0),
            rate: Number(row?.rate || 0),
            total: Number((row?.rate || 0) * (row?.weight || 0)),
            chalanNo: String(row?.chalanNo || ''),
          }))
          : [];
        const rowsTotal = rows.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
        const computedRouteAmount = Number(baseAmount + rowsTotal);
        const routeAmount = Number(route?.routeAmount ?? computedRouteAmount);
        const advanceAmounts = Array.isArray(route?.advanceAmounts) ? route.advanceAmounts.map((a: any) => ({
          label: String(a?.label || ''),
          amount: Number(a?.amount || 0),
        })) : [];
        const advanceAmount = advanceAmounts.length > 0
          ? advanceAmounts.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0)
          : Number(route?.advanceAmount ?? 0);
        return {
          ...route,
          weight,
          rate,
          rows,
          routeAmount,
          expenses,
          totalExpense,
          advanceAmount,
          advanceAmounts,
          paymentReceived: route?.paymentReceived ?? 'appuser',
        };
      });
    }

    // Validate required fields
    if (!body.createdBy) {
      return NextResponse.json(
        { error: 'createdBy field is required' },
        { status: 400 }
      );
    }

    // Generate trip ID
    const tripCount = await Trip.countDocuments();
    const tripId = `TRIP${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}${String(tripCount + 1).padStart(3, '0')}`;

    // Get vehicle's latest fuel tracking record
    const latestFuelRecord = await FuelTracking.findOne({ vehicleId: body.vehicleId })
      .sort({ createdAt: -1 });

    if (!latestFuelRecord) {
      return NextResponse.json(
        { error: 'No fuel tracking record found for this vehicle' },
        { status: 400 }
      );
    }

    // Calculate fuel needed and diesel cost
    const totalKm = body.endKm - body.startKm;
    const fuelNeededForTrip = totalKm / (latestFuelRecord.truckAverage || 1);
    const tripDiselCost = fuelNeededForTrip * latestFuelRecord.fuelRate;

    // Calculate required fields
    const tripRouteCost = body.routeWiseExpenseBreakdown.reduce((sum: number, route: any) => sum + route.routeAmount, 0);
    const tripExpenses = body.routeWiseExpenseBreakdown.reduce((sum: number, route: any) => {
      return sum + route.expenses.reduce((expSum: number, exp: any) => expSum + exp.total, 0);
    }, 0);
    const remainingAmount = tripRouteCost - tripExpenses - tripDiselCost;

    // Create trip
    const tripData = {
      ...body,
      tripId,
      totalKm,
      fuelNeededForTrip,
      tripDiselCost,
      tripFuelQuantity: fuelNeededForTrip,
      totalTripKm: totalKm,
      tripRouteCost,
      tripExpenses,
      remainingAmount,
      createdBy: body.createdBy // Use the createdBy from request body
    };

    const trip = new Trip(tripData);
    await trip.save();

    // Calculate total expenses from all routes
    const totalExpenses = tripExpenses;

    // Update driver budget - minus total expenses from remaining budget
    const driverBudget = await DriverBudget.findOne({ driverId: body.driverId })
      .sort({ createdAt: -1 });

    if (driverBudget) {
      const currentRemaining = typeof driverBudget.remainingBudgetAmount === 'number'
        ? driverBudget.remainingBudgetAmount
        : driverBudget.dailyBudgetAmount;
      const newRemainingBudget = Math.max(0, currentRemaining - totalExpenses);

      // Update the driver budget with new remaining amount
      await DriverBudget.findByIdAndUpdate(driverBudget._id, {
        remainingBudgetAmount: newRemainingBudget
      });
    }

    // Update fuel quantity in fuel tracking - minus trip fuel quantity
    await FuelTracking.findByIdAndUpdate(latestFuelRecord._id, {
      $inc: { fuelQuantity: -fuelNeededForTrip }
    });

    // Track next LR numbers for each user in this request to handle multiple routes per user
    const nextLrMap = new Map<string, number>();

    // Generate route-wise invoices and conditionally create income/transactions based on per-route status,
    // with support for advanceAmount on completed routes
    for (const route of body.routeWiseExpenseBreakdown) {
      const advanceAmount = Number(route.advanceAmount || 0);
      const routeAmount = Number(route.routeAmount || 0);
      const remainingAmount = Math.max(0, routeAmount - advanceAmount);
      // Invoice is "Paid" when: route is completed AND (no advance OR advance equals/exceeds route amount)
      // Invoice is "Unpaid" when: route is completed AND advance is partial (0 < advance < routeAmount)
      const isFullyPaidByAdvance = advanceAmount > 0 && remainingAmount === 0;
      const isCompletedWithPartialAdvance = route.routeStatus === 'Completed' && advanceAmount > 0 && remainingAmount > 0;

      const userIdStr = String(route.userId);
      let nextLrVal = nextLrMap.get(userIdStr);
      let prefix = 'LR';

      // Load user prefix from map globally or fetch user dynamically
      const appUser = await AppUser.findById(route.userId);
      if (appUser && appUser.name) {
        const userName = appUser.name.trim();
        const LR_PREFIX_MAP: Record<string, string> = {
          'Riyaj Sayyad': 'RS',
          'Asif Sayyad': 'AS',
          'Rahiman Sayyad': 'RD',
          'Rehiman Sayyad': 'RD',
          'RDS Transport': 'RDS',
          'KGN Trading': 'KGN',
        };
        prefix = LR_PREFIX_MAP[userName] || 'LR';
      }

      // If we haven't fetched the latest LR for this user yet, do it now
      if (nextLrVal === undefined) {
        const latestInvoice = await Invoice.findOne({
          lrNo: { $regex: new RegExp(`^${prefix}\\d+$`) }
        }).sort({ lrNo: -1 });

        let currentMax = 0;
        if (latestInvoice && latestInvoice.lrNo) {
          const numericPart = latestInvoice.lrNo.replace(prefix, '');
          const parsed = parseInt(numericPart, 10);
          if (!isNaN(parsed)) {
            currentMax = parsed;
          }
        }
        nextLrVal = currentMax + 1;
        nextLrMap.set(userIdStr, nextLrVal);
      } else {
        // Increment for subsequent routes of the same user
        nextLrVal += 1;
        nextLrMap.set(userIdStr, nextLrVal);
      }

      // Generate the sequential LR string with user specific prefix
      const sequentialLrNo = `${prefix}${String(nextLrVal).padStart(5, '0')}`;
      const finalLrNo = sequentialLrNo;

      const paymentReceived = route.paymentReceived === 'driver' ? 'driver' : 'appuser';

      // Persist the locations array/list from the frontend if provided
      const locations = Array.isArray(route.locations) ? route.locations : [];
      // Determine Start/End for Invoice: Filter by 'filled' status if available
      const filledLocations = locations.filter((l: any) => l.status === 'filled');
      const invoiceStartLocation = filledLocations.length > 0 ? filledLocations[0].from : route.startLocation;
      const invoiceEndLocation = filledLocations.length > 0 ? filledLocations[filledLocations.length - 1].to : route.endLocation;

      // Upsert invoice using explicit tripId and routeNumber linkage to prevent detached duplicates
      await Invoice.updateOne(
        { tripId, routeNumber: route.routeNumber },
        {
          $set: {
            date: (route?.dates && route.dates[0]) ? route.dates[0] : ((body.date && body.date[0]) ? body.date[0] : new Date()),
            from: invoiceStartLocation,
            to: invoiceEndLocation,
            customerName: route.customerName,
            lrNo: finalLrNo,
            tripId,
            routeNumber: route.routeNumber,
            rows: [
              ...(route.productName
                ? [{
                  product: route.productName,
                  truckNo: body.vehicleNumber,
                  weight: route.weight,
                  rate: route.rate,
                  total: Number(route.rate || 0) * Number(route.weight || 0),
                  articles: String((route as any).chalanNo || ''),
                }]
                : []),
              ...((Array.isArray(route.rows) ? route.rows : []).map((row: any) => ({
                product: row.productName,
                truckNo: body.vehicleNumber,
                weight: row.weight,
                rate: row.rate,
                total: row.total,
                articles: String(row.chalanNo || ''),
              })))
            ],
            total: route.routeAmount,
            advanceAmount,
            remainingAmount,
            appUserId: route.userId,
            bankId: route.bankId,
            status: route.routeStatus === 'Completed' 
              ? (advanceAmount > 0 && advanceAmount < routeAmount ? 'Unpaid' : 'Paid')
              : 'Unpaid',
            remarks: paymentReceived === 'driver' && advanceAmount > 0 ? '[ADVANCE_CREDITED_TO_DRIVER]' : '',
            advanceAmounts: Array.isArray(route.advanceAmounts) ? route.advanceAmounts : [],
          }
        },
        { upsert: true }
      );

      // Only create income, transactions, and bank updates when route is Completed AND payment was received by app user, AND there's no advance (so it's fully paid)
      if (route.routeStatus === 'Completed' && paymentReceived !== 'driver' && advanceAmount === 0) {
        const incomeAmount = Number(route.routeAmount || 0);
        const incomeDesc = `Income from trip ${tripId} - Route ${route.routeNumber}`;

        // Create Income record
        const income = await Income.create({
          appUserId: route.userId,
          date: (route?.dates && route.dates[0]) ? route.dates[0] : ((body.date && body.date[0]) ? body.date[0] : new Date()),
          category: 'Trip Income',
          amount: incomeAmount,
          description: incomeDesc,
          bankId: route.bankId
        });

        // Create Transaction record for income
        let transactionCount = await Transaction.countDocuments();
        const transactionId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;

        // Get current bank balance before update
        const bank = await Bank.findById(route.bankId);
        const balanceAfter = (bank?.balance || 0) + incomeAmount;

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
          balanceAfter,
          date: (route?.dates && route.dates[0]) ? route.dates[0] : ((body.date && body.date[0]) ? body.date[0] : new Date())
        });

        // Update bank balance based on selected app user and bank
        await Bank.findByIdAndUpdate(route.bankId, {
          $inc: { balance: incomeAmount }
        });

        // Create Transaction record for bank balance update
        transactionCount = await Transaction.countDocuments();
        const bankTransactionId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;

        await Transaction.create({
          transactionId: bankTransactionId,
          type: 'BANK_UPDATE',
          description: `Bank balance update for trip ${tripId} - Route ${route.routeNumber}`,
          amount: incomeAmount,
          toBankId: route.bankId,
          appUserId: route.userId,
          relatedEntityId: route.bankId,
          relatedEntityType: 'Bank',
          category: 'Bank Update',
          status: 'COMPLETED',
          balanceAfter,
          date: (route?.dates && route.dates[0]) ? route.dates[0] : ((body.date && body.date[0]) ? body.date[0] : new Date())
        });
      } else if (route.routeStatus === 'Completed' && paymentReceived === 'driver') {
        // Driver advance is now explicitly handled via the manual 'Add Advance Amount' button in the UI.
        // We skip automatically crediting the driver budget here to prevent duplicate transactions.
      }

      // Note: Expense records are not created here as expenses are already deducted from driver budget

      // Ensure the persisted Trip document reflects the latest advanceAmount per route
      await Trip.updateOne(
        { _id: trip._id, 'routeWiseExpenseBreakdown.routeNumber': route.routeNumber },
        { $set: { 'routeWiseExpenseBreakdown.$.advanceAmount': advanceAmount, 'routeWiseExpenseBreakdown.$.paymentReceived': paymentReceived } }
      );

      // Create App User Expense records for any per-route app user expenses
      const dbRoute = trip.routeWiseExpenseBreakdown.find((r: any) => r.routeNumber === route.routeNumber);
      if (dbRoute && (route.routeStatus === 'In Progress' || route.routeStatus === 'Completed')) {
        const routeAppUserExpenses = Array.isArray(dbRoute.appUserExpenses) ? dbRoute.appUserExpenses : [];
        for (const appExp of routeAppUserExpenses) {
          const amount = Number(appExp?.amount ?? 0);
          const appUserId = appExp?.appUserId || route.userId; // fallback to route app user
          const bankId = appExp?.bankId || route.bankId;       // fallback to route bank
          const category = appExp?.category || 'Trip Expense';
          const description = appExp?.description || `App User Expense from trip ${tripId} - Route ${route.routeNumber}`;

          // Skip invalid or zero-amount expenses
          if (!appUserId || !bankId || amount <= 0) continue;

          const expenseDate = (route?.dates && route.dates[0])
            ? route.dates[0]
            : ((body.date && body.date[0]) ? body.date[0] : new Date());

          // Create Expense record
          const expense = await Expense.create({
            appUserId,
            bankId,
            category,
            amount,
            description,
            date: expenseDate,
          });

          // Store the expenseId in the AppUserExpense subdocument
          appExp.expenseId = expense._id;

          // Compute new bank balance and update
          const currentBank = await Bank.findById(bankId);
          const balanceAfter = (currentBank?.balance || 0) - amount;
          await Bank.findByIdAndUpdate(bankId, { $inc: { balance: -amount } });

          // Create Transaction record for this expense
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

          // Link the expense to its transaction
          await Expense.findByIdAndUpdate(expense._id, { transactionId: transaction._id });
        }
      }
    }

    // Create attendance records only if any route is marked Completed
    const anyCompletedRoute = (body.routeWiseExpenseBreakdown || []).some((r: any) => r.routeStatus === 'Completed');
    if (anyCompletedRoute) {
      await createAttendanceRecords(body, trip._id, tripId);
    }

    await trip.save();

    // ---------------------------------------------------------
    // Auto-Generate Invoices for each Route in the Trip
    // ---------------------------------------------------------
    try {
      const Invoice = (await import('@/models/Invoice')).default;
      const AppUser = (await import('@/models/AppUser')).default;

      // LR prefix mapping
      const LR_PREFIX_MAP: Record<string, string> = {
        'Riyaj Sayyad': 'RS',
        'Asif Sayyad': 'AS',
        'Rahiman Sayyad': 'RD',
        'Rehiman Sayyad': 'RD',
        'RDS Transport': 'RDS',
        'KGN Trading': 'KGN',
      };

      // The primary for-loop above (lines 244-450) already successfully generates 
      // the sequential, fully-featured Invoices (including advancedAmount and appUser linkage).
      // A duplicate 'process each route to create an invoice' loop existed here and has been removed to prevent double-invoicing.
    } catch (invoiceError) {
      console.error("Error auto-generating invoices for trip:", invoiceError);
      // We don't block the trip creation if invoice generation fails, but we log it.
    }

    return NextResponse.json(trip, { status: 201 });
  } catch (error) {
    console.error('Error creating trip:', error);
    const message = (error as any)?.message || 'Failed to create trip';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Helper function to create attendance records
async function createAttendanceRecords(tripData: any, tripObjectId: any, tripId: string) {
  try {
    // Ensure we have driver name; fallback if absent
    let driverName = tripData.driverName;
    if (!driverName && tripData.driverId) {
      const driver = await Driver.findById(tripData.driverId).select('name');
      driverName = driver?.name || 'Unknown Driver';
    }

    // Create or update attendance ONLY for actual trip dates
    for (const d of tripData.date || []) {
      const dateObj = new Date(d);
      // Normalize to midnight to avoid time zone mismatches
      const normalizedDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

      await Attendance.updateOne(
        { driverId: tripData.driverId, date: normalizedDate },
        {
          $set: {
            driverId: tripData.driverId,
            driverName,
            date: normalizedDate,
            status: 'On Trip',
            tripId: tripObjectId,
            tripNumber: tripId,
            remarks: 'On Trip',
            createdBy: tripData.createdBy
          }
        },
        { upsert: true }
      );
    }
  } catch (error) {
    console.error('Error creating attendance records:', error);
    throw error;
  }
}

// Helper function to create records when trip is completed
async function createCompletedTripRecords(trip: any) {
  try {
    // Create attendance records for each trip date
    await createAttendanceRecords(trip, trip._id, trip.tripId);

    // Create route-wise invoices, income, expense records and transactions
    for (const route of trip.routeWiseExpenseBreakdown) {
      const advanceAmount = Number(route.advanceAmount || 0);
      const remainingAmount = Math.max(0, Number(route.routeAmount || 0) - advanceAmount);
      const isAdvance = advanceAmount > 0;

      // Upsert Invoice by lrNo to avoid duplicate-key errors
      await Invoice.updateOne(
        { lrNo: `LR${trip.tripId}${route.routeNumber}` },
        {
          $set: {
            date: (route?.dates && route.dates[0]) ? route.dates[0] : (trip.date && trip.date[0]) ? trip.date[0] : new Date(),
            from: route.startLocation,
            to: route.endLocation,
            customerName: route.customerName,
            lrNo: `LR${trip.tripId}${route.routeNumber}`,
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
            appUserId: route.userId,
            status: isAdvance ? 'Unpaid' : 'Paid'
          }
        },
        { upsert: true }
      );

      // Create Income record
      const income = await Income.create({
        appUserId: route.userId,
        date: (route?.dates && route.dates[0]) ? route.dates[0] : (trip.date && trip.date[0]) ? trip.date[0] : new Date(),
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
      const balanceAfter = (bank?.balance || 0) + incomeAmount;

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
        balanceAfter,
        date: (route?.dates && route.dates[0]) ? route.dates[0] : (trip.date && trip.date[0]) ? trip.date[0] : new Date()
      });

      // Update bank balance
      await Bank.findByIdAndUpdate(route.bankId, {
        $inc: { balance: incomeAmount }
      });

      // Create Transaction record for bank balance update
      transactionCount = await Transaction.countDocuments();
      const bankTransactionId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;

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
        balanceAfter,
        date: (route?.dates && route.dates[0]) ? route.dates[0] : (trip.date && trip.date[0]) ? trip.date[0] : new Date()
      });

      // Note: Expense records are not created here as expenses are already deducted from driver budget
    }
  } catch (error) {
    console.error('Error creating completed trip records:', error);
    throw error;
  }
}
