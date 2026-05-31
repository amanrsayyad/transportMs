import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import DriverBudget from '@/models/DriverBudget';
import Transaction from '@/models/Transaction';

// POST - Credit driver's budget with an advance amount and create a transaction
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const {
      driverId,
      amount,
      date,
      customerName,
      startLocation,
      endLocation,
    } = body || {};

    if (!driverId || amount === undefined) {
      return NextResponse.json(
        { error: 'driverId and amount are required' },
        { status: 400 }
      );
    }

    const adv = Number(amount);
    if (Number.isNaN(adv) || adv <= 0) {
      return NextResponse.json(
        { error: 'amount must be a positive number' },
        { status: 400 }
      );
    }

    const latestBudget = await DriverBudget.findOne({ driverId }).sort({ createdAt: -1 });
    if (!latestBudget) {
      return NextResponse.json(
        { error: 'No driver budget found to credit. Allocate a budget first.' },
        { status: 404 }
      );
    }

    const toIso = (d: any) => {
      try {
        const dt = new Date(d);
        return isNaN(dt.getTime()) ? String(d) : dt.toISOString().split('T')[0];
      } catch {
        return String(d);
      }
    };

    const isoDate = toIso(date || new Date());
    const marker = `[ADVANCE_CREDITED:${(startLocation || '').trim()}->${(endLocation || '').trim()}|${(customerName || '').trim()}|${adv}|${isoDate}]`;
    const descLine = `Advance credited to driver | Date: ${isoDate} | Customer: ${customerName || ''} | Locations: ${startLocation || ''} -> ${endLocation || ''} | Advance: ${adv} ${marker}`;
    const combinedDesc = [latestBudget.description, descLine].filter(Boolean).join('\n');

    if ((latestBudget.description || '').includes(marker)) {
      return NextResponse.json(
        { error: 'Advance already credited to driver budget for this route/date' },
        { status: 400 }
      );
    }

    await DriverBudget.findByIdAndUpdate(latestBudget._id, {
      $inc: { remainingBudgetAmount: adv },
      $set: { description: combinedDesc },
    });

    let transactionCount = await Transaction.countDocuments();
    const transactionId = `TXN${new Date().getFullYear()}${String(transactionCount + 1).padStart(6, '0')}`;
    await Transaction.create({
      transactionId,
      type: 'DRIVER_BUDGET',
      description: descLine,
      amount: adv,
      appUserId: latestBudget.appUserId,
      relatedEntityId: latestBudget._id,
      relatedEntityType: 'DriverBudget',
      category: 'Driver Advance',
      status: 'COMPLETED',
      date: date ? new Date(date) : new Date(),
    });

    const populated = await DriverBudget.findById(latestBudget._id)
      .populate('appUserId', 'name email')
      .populate('bankId', 'bankName accountNumber')
      .populate('driverId', 'name licenseNumber');

    return NextResponse.json(populated, { status: 200 });
  } catch (error) {
    console.error('Error crediting driver advance:', error);
    return NextResponse.json(
      { error: 'Failed to credit driver advance' },
      { status: 500 }
    );
  }
}
