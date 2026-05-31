import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import DriverBudget from '@/models/DriverBudget';
import Bank from '@/models/Bank';
import Transaction from '@/models/Transaction';
import Income from '@/models/Income';
import AppUser from '@/models/AppUser';
import Driver from '@/models/Driver';

// POST - Deduct amount from driver's budget, credit bank, create transaction and income
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { appUserId, bankId, driverId, amount, date, description } = body;

    // Validate required fields
    if (!appUserId || !bankId || !driverId || !amount || !date) {
      return NextResponse.json(
        { error: 'App user, bank, driver, amount, and date are required' },
        { status: 400 }
      );
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    // Verify app user, bank, and driver exist
    const [appUser, bank, driver] = await Promise.all([
      AppUser.findById(appUserId),
      Bank.findById(bankId),
      Driver.findById(driverId),
    ]);

    if (!appUser) {
      return NextResponse.json({ error: 'App user not found' }, { status: 404 });
    }
    if (!bank) {
      return NextResponse.json({ error: 'Bank not found' }, { status: 404 });
    }
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // Fetch latest budget for the driver
    const latestBudget = await DriverBudget.findOne({ driverId }).sort({ createdAt: -1 });
    if (!latestBudget) {
      return NextResponse.json({ error: 'No budget found for this driver' }, { status: 404 });
    }

    const remaining = latestBudget.remainingBudgetAmount || 0;
    if (remaining < numericAmount) {
      return NextResponse.json(
        { error: 'Insufficient remaining budget to deduct the specified amount' },
        { status: 400 }
      );
    }

    // Update the driver budget: deduct from remaining and append description
    const toIso = (d: any) => {
      try {
        const dt = new Date(d);
        return isNaN(dt.getTime()) ? String(d) : dt.toISOString().split('T')[0];
      } catch {
        return String(d);
      }
    };
    const descLine = `Deducted ${numericAmount} from driver budget and credited to bank ${bank.bankName} - ${bank.accountNumber} on ${toIso(date)}`;
    const combinedDesc = [latestBudget.description, description, descLine].filter(Boolean).join('\n');

    await DriverBudget.findByIdAndUpdate(latestBudget._id, {
      $inc: { remainingBudgetAmount: -numericAmount },
      $set: { description: combinedDesc },
    });

    // Create Income record for the credited amount
    const income = await Income.create({
      appUserId,
      bankId,
      category: 'Driver Budget Return',
      amount: numericAmount,
      description: description || `Driver budget returned: ${numericAmount} for ${driver.name}`,
      date: new Date(date),
    });

    // Create INCOME transaction referencing the income
    let transactionCount = await Transaction.countDocuments();
    const incomeTxnId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;

    const balanceAfterIncome = (bank?.balance || 0) + numericAmount;
    await Transaction.create({
      transactionId: incomeTxnId,
      type: 'INCOME',
      description: description || `Driver budget return for ${driver.name}`,
      amount: numericAmount,
      toBankId: bankId,
      appUserId,
      relatedEntityId: income._id,
      relatedEntityType: 'Income',
      category: 'Driver Budget Return',
      status: 'COMPLETED',
      balanceAfter: balanceAfterIncome,
      date: new Date(date),
    });

    // Update bank balance
    await Bank.findByIdAndUpdate(bankId, { $inc: { balance: numericAmount } });
    const updatedBank = await Bank.findById(bankId);

    // Create BANK_UPDATE transaction
    transactionCount = await Transaction.countDocuments();
    const bankTxnId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;
    await Transaction.create({
      transactionId: bankTxnId,
      type: 'BANK_UPDATE',
      description: `Bank balance update for driver budget return - ${driver.name}`,
      amount: numericAmount,
      toBankId: bankId,
      appUserId,
      relatedEntityId: bankId,
      relatedEntityType: 'Bank',
      category: 'Bank Update',
      status: 'COMPLETED',
      balanceAfter: updatedBank?.balance || undefined,
      date: new Date(date),
    });

    // Return updated latest budget state
    const populatedBudget = await DriverBudget.findById(latestBudget._id)
      .populate('appUserId', 'name email')
      .populate('bankId', 'bankName accountNumber')
      .populate('driverId', 'name licenseNumber');

    return NextResponse.json(populatedBudget, { status: 200 });
  } catch (error) {
    console.error('Error deducting driver budget:', error);
    return NextResponse.json(
      { error: 'Failed to deduct driver budget' },
      { status: 500 }
    );
  }
}