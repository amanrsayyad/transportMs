import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import FuelTracking from '@/models/FuelTracking';
import Bank from '@/models/Bank';
import Transaction from '@/models/Transaction';
import AppUser from '@/models/AppUser';
import Vehicle from '@/models/Vehicle';

// GET - Fetch single fuel tracking record
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const resolvedParams = await params;
    const id = resolvedParams?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const fuelTracking = await FuelTracking.findById(id)
      .populate('appUserId', 'name email')
      .populate('bankId', 'bankName accountNumber')
      .populate('vehicleId', 'registrationNumber vehicleType vehicleWeight vehicleStatus');

    if (!fuelTracking) {
      return NextResponse.json(
        { error: 'Fuel tracking record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(fuelTracking);
  } catch (error) {
    console.error('Error fetching fuel tracking record:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fuel tracking record' },
      { status: 500 }
    );
  }
}

// PUT - Update fuel tracking record
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const resolvedParams = await params;
    const id = resolvedParams?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const existingRecord = await FuelTracking.findById(id);

    if (!existingRecord) {
      return NextResponse.json(
        { error: 'Fuel tracking record not found' },
        { status: 404 }
      );
    }

    // Validation
    if (body.endKm <= body.startKm) {
      return NextResponse.json(
        { error: 'End KM must be greater than Start KM' },
        { status: 400 }
      );
    }

    if ((body.addFuelQuantity === undefined || body.addFuelQuantity <= 0) || body.fuelRate <= 0) {
      return NextResponse.json(
        { error: 'Add fuel quantity and rate must be greater than 0' },
        { status: 400 }
      );
    }

    // Verify related entities exist
    const [appUser, bank, vehicle] = await Promise.all([
      AppUser.findById(body.appUserId),
      Bank.findById(body.bankId),
      Vehicle.findById(body.vehicleId)
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

    // Use provided totalAmount/truckAverage if available (for manual overrides), otherwise calculate
    const effectiveAdd = body.addFuelQuantity ?? body.fuelQuantity;
    const totalAmount = body.totalAmount ?? (effectiveAdd * body.fuelRate);
    const distance = body.endKm - body.startKm;
    const truckAverage = body.truckAverage ?? (distance / effectiveAdd);

    // Check if bank has sufficient balance for the difference
    const amountDifference = totalAmount - existingRecord.totalAmount;
    if (amountDifference > 0 && bank.balance < amountDifference) {
      return NextResponse.json(
        { error: 'Insufficient bank balance for this update' },
        { status: 400 }
      );
    }

    // Handle carry-forward logic if vehicle changed
    let carryForwardFuel = 0;
    if (body.vehicleId !== existingRecord.vehicleId.toString()) {
      // Get previous fuel record for new vehicle
      const previousFuelRecord = await FuelTracking.findOne({
        vehicleId: body.vehicleId,
        createdAt: { $lt: existingRecord.createdAt }
      }).sort({ createdAt: -1 });

      if (previousFuelRecord && previousFuelRecord.remainingFuelQuantity > 0) {
        carryForwardFuel = previousFuelRecord.remainingFuelQuantity;
        // Reset previous record's remaining fuel
        await FuelTracking.findByIdAndUpdate(previousFuelRecord._id, {
          remainingFuelQuantity: 0
        });
      }

      // Restore remaining fuel to old vehicle's previous record
      const oldVehiclePreviousRecord = await FuelTracking.findOne({
        vehicleId: existingRecord.vehicleId,
        createdAt: { $lt: existingRecord.createdAt }
      }).sort({ createdAt: -1 });

      if (oldVehiclePreviousRecord) {
        await FuelTracking.findByIdAndUpdate(oldVehiclePreviousRecord._id, {
          remainingFuelQuantity: existingRecord.fuelQuantity + carryForwardFuel
        });
      }
    }

    const totalFuelQuantity = body.fuelQuantity + carryForwardFuel;

    // Update the fuel tracking record
    const updatedRecord = await FuelTracking.findByIdAndUpdate(
      id,
      {
        appUserId: body.appUserId,
        bankId: body.bankId,
        vehicleId: body.vehicleId,
        startKm: body.startKm,
        endKm: body.endKm,
        fuelQuantity: body.fuelQuantity,
        addFuelQuantity: body.addFuelQuantity ?? existingRecord.addFuelQuantity ?? 0,
        fuelRate: body.fuelRate,
        totalAmount,
        truckAverage,
        date: body.date,
        description: body.description || '',
        paymentType: body.paymentType,
        remainingFuelQuantity: totalFuelQuantity
      },
      { new: true, runValidators: true }
    );

    // Update bank balance
    await Bank.findByIdAndUpdate(body.bankId, {
      $inc: { balance: -amountDifference }
    });

    // Create adjustment transaction if amount changed
    if (amountDifference !== 0) {
      const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const isExpenseIncrease = amountDifference > 0;

      const transaction = new Transaction({
        transactionId,
        type: isExpenseIncrease ? 'FUEL' : 'INCOME', // FUEL for extra cost, INCOME for refund
        description: `Fuel expense adjustment for ${vehicle.registrationNumber}: ${isExpenseIncrease ? '+' : ''}${amountDifference.toFixed(2)}`,
        amount: Math.abs(amountDifference),
        // If expense increased, funds come FROM bank. If decreased (refund), funds go TO bank (conceptually), but Transaction schema usually uses fromBankId for expenses.
        // For FUEL type, fromBankId is payer. For INCOME type, toBankId is receiver.
        fromBankId: isExpenseIncrease ? body.bankId : undefined,
        toBankId: isExpenseIncrease ? undefined : body.bankId,
        appUserId: body.appUserId,
        relatedEntityId: updatedRecord._id,
        relatedEntityType: 'FuelTracking',
        category: 'Fuel Adjustment',
        balanceAfter: (await Bank.findById(body.bankId))?.balance || 0,
        date: body.date,
      });

      await transaction.save();
    }

    // Populate and return the updated record
    const populatedRecord = await FuelTracking.findById(updatedRecord._id)
      .populate('appUserId', 'name email')
      .populate('bankId', 'bankName accountNumber')
      .populate('vehicleId', 'registrationNumber vehicleType vehicleWeight vehicleStatus');

    return NextResponse.json(populatedRecord);
  } catch (error) {
    console.error('Error updating fuel tracking record:', error);
    return NextResponse.json(
      { error: 'Failed to update fuel tracking record' },
      { status: 500 }
    );
  }
}

// DELETE - Delete fuel tracking record
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const resolvedParams = await params;
    const id = resolvedParams?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const fuelRecord = await FuelTracking.findById(id);

    if (!fuelRecord) {
      return NextResponse.json(
        { error: 'Fuel tracking record not found' },
        { status: 404 }
      );
    }

    // Restore bank balance
    await Bank.findByIdAndUpdate(fuelRecord.bankId, {
      $inc: { balance: fuelRecord.totalAmount }
    });

    // Handle carry-forward restoration
    // Find the previous fuel record for this vehicle
    const previousFuelRecord = await FuelTracking.findOne({
      vehicleId: fuelRecord.vehicleId,
      createdAt: { $lt: fuelRecord.createdAt }
    }).sort({ createdAt: -1 });

    if (previousFuelRecord) {
      // Restore the remaining fuel to the previous record
      await FuelTracking.findByIdAndUpdate(previousFuelRecord._id, {
        remainingFuelQuantity: fuelRecord.remainingFuelQuantity
      });
    }

    // Delete associated transaction
    await Transaction.deleteOne({ relatedEntityId: id, relatedEntityType: 'FuelTracking' });

    // Delete the fuel tracking record
    await FuelTracking.findByIdAndDelete(id);

    return NextResponse.json({ message: 'Fuel tracking record deleted successfully' });
  } catch (error) {
    console.error('Error deleting fuel tracking record:', error);
    return NextResponse.json(
      { error: 'Failed to delete fuel tracking record' },
      { status: 500 }
    );
  }
}

// PATCH - Partial update for fuel tracking record (e.g., fuel quantity adjustment)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const resolvedParams = await params;
    const id = resolvedParams?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate only allowed fields
    if (Object.keys(body).some(key => !['fuelQuantity'].includes(key))) {
      return NextResponse.json(
        { error: 'Only fuelQuantity can be updated via PATCH' },
        { status: 400 }
      );
    }

    const updatedRecord = await FuelTracking.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true }
    );

    if (!updatedRecord) {
      return NextResponse.json(
        { error: 'Fuel tracking record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedRecord);
  } catch (error) {
    console.error('Error patching fuel tracking record:', error);
    return NextResponse.json(
      { error: 'Failed to update fuel tracking record' },
      { status: 500 }
    );
  }
}