import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Vehicle from '@/models/Vehicle';
import FuelQuickAdd from '@/models/FuelQuickAdd';
import AppUser from '@/models/AppUser';
import Bank from '@/models/Bank';
import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';
import FuelTracking from '@/models/FuelTracking';

// POST - Create a minimal fuel add record (vehicle + quantity only)
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { appUserId, bankId, vehicleId, fuelQuantity, fuelRate, date, description } = body || {};

    if (!appUserId || !bankId || !vehicleId || fuelQuantity === undefined) {
      return NextResponse.json(
        { error: 'appUserId, bankId, vehicleId and fuelQuantity are required' },
        { status: 400 }
      );
    }

    const qty = Number(fuelQuantity);
    if (Number.isNaN(qty) || qty <= 0) {
      return NextResponse.json(
        { error: 'fuelQuantity must be a positive number' },
        { status: 400 }
      );
    }

    const [appUser, bank, vehicle] = await Promise.all([
      AppUser.findById(appUserId),
      Bank.findById(bankId),
      Vehicle.findById(vehicleId)
    ]);

    if (!appUser) {
      return NextResponse.json(
        { error: 'App user not found' },
        { status: 404 }
      );
    }

    if (!bank) {
      return NextResponse.json(
        { error: 'Bank not found' },
        { status: 404 }
      );
    }

    if (!vehicle) {
      return NextResponse.json(
        { error: 'Vehicle not found' },
        { status: 404 }
      );
    }

    // Use provided fuelRate if valid, otherwise infer from latest fuel tracking record
    const latestFuelRecord = await FuelTracking.findOne({ vehicleId }).sort({ createdAt: -1 });
    const providedRate = Number(fuelRate) || 0;
    const effectiveRate = providedRate > 0 ? providedRate : (Number(latestFuelRecord?.fuelRate ?? 0) || 0);
    const totalAmount = effectiveRate > 0 ? qty * effectiveRate : 0;

    // Check bank balance if amount > 0
    if (totalAmount > 0 && bank.balance < totalAmount) {
      return NextResponse.json(
        { error: 'Insufficient balance in bank account' },
        { status: 400 }
      );
    }

    const record = new FuelQuickAdd({
      vehicleId,
      fuelQuantity: qty,
      date: date ? new Date(date) : new Date(),
      description: description || '',
    });

    await record.save();

    // Also add this quick fuel quantity to the vehicle's latest fuel tracking record
    if (latestFuelRecord) {
      await FuelTracking.findByIdAndUpdate(latestFuelRecord._id, {
        $inc: { fuelQuantity: qty }
      });
      console.log(`Added ${qty}L quick fuel to latest fuel tracking record ${latestFuelRecord._id} for vehicle ${vehicleId}`);
    }

    // Update bank balance and create finance records if we have a rate
    if (totalAmount > 0) {
      await Bank.findByIdAndUpdate(bankId, { $inc: { balance: -totalAmount } });
      const updatedBank = await Bank.findById(bankId);

      const expense = await Expense.create({
        appUserId,
        bankId,
        category: 'Fuel Quick Add',
        amount: totalAmount,
        description: description || `Quick fuel add for ${vehicle.registrationNumber} - ${qty}L`,
        date: date ? new Date(date) : new Date(),
      });

      let transactionCount = await Transaction.countDocuments();
      const transactionId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;
      const txn = await Transaction.create({
        transactionId,
        type: 'FUEL',
        description: description || `Quick fuel add for ${vehicle.registrationNumber} - ${qty}L`,
        amount: totalAmount,
        fromBankId: bankId,
        appUserId,
        relatedEntityId: expense._id,
        relatedEntityType: 'Expense',
        category: 'Fuel Expense',
        status: 'COMPLETED',
        balanceAfter: updatedBank?.balance || 0,
        date: date ? new Date(date) : new Date(),
      });
      await Expense.findByIdAndUpdate(expense._id, { transactionId: txn._id });

      transactionCount = await Transaction.countDocuments();
      const bankUpdateTxnId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;
      await Transaction.create({
        transactionId: bankUpdateTxnId,
        type: 'BANK_UPDATE',
        description: `Bank balance update for quick fuel add - ${vehicle.registrationNumber}`,
        amount: totalAmount,
        fromBankId: bankId,
        appUserId,
        relatedEntityId: bankId,
        relatedEntityType: 'Bank',
        category: 'Bank Update',
        status: 'COMPLETED',
        balanceAfter: updatedBank?.balance || 0,
        date: date ? new Date(date) : new Date(),
      });
    }

    const populated = await FuelQuickAdd.findById(record._id)
      .populate('vehicleId', 'registrationNumber vehicleType vehicleWeight');

    return NextResponse.json(populated, { status: 201 });
  } catch (error) {
    console.error('Error creating quick fuel add record:', error);
    return NextResponse.json(
      { error: 'Failed to create quick fuel add record' },
      { status: 500 }
    );
  }
}

// GET - Optional: list quick fuel adds, filter by vehicleId
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const vehicleId = searchParams.get('vehicleId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    const query: any = {};
    if (vehicleId) query.vehicleId = vehicleId;

    const total = await FuelQuickAdd.countDocuments(query);
    const pages = Math.ceil(total / limit);

    const items = await FuelQuickAdd.find(query)
      .populate('vehicleId', 'registrationNumber vehicleType vehicleWeight')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return NextResponse.json({ data: items, page, limit, total, pages }, { status: 200 });
  } catch (error) {
    console.error('Error fetching quick fuel add records:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quick fuel add records' },
      { status: 500 }
    );
  }
}
