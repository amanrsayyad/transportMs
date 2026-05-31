import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Maintenance from '@/models/Maintenance';
import Trip from '@/models/Trip';
import Bank from '@/models/Bank';
import Expense from '@/models/Expense';
import Transaction from '@/models/Transaction';

// GET - Fetch maintenance records
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const appUserId = searchParams.get('appUserId');
    const vehicleId = searchParams.get('vehicleId');
    const status = searchParams.get('status');

    let query: any = {};
    if (appUserId) query.appUserId = appUserId;
    if (vehicleId) query.vehicleId = vehicleId;
    if (status) query.status = status;

    const maintenanceRecords = await Maintenance.find(query)
      .populate('appUserId', 'name')
      .populate('vehicleId', 'vehicleNumber')
      .populate('bankId', 'bankName')
      .populate('mechanicId', 'name phone')
      .sort({ createdAt: -1 });

    return NextResponse.json(maintenanceRecords);
  } catch (error) {
    console.error('Error fetching maintenance records:', error);
    return NextResponse.json(
      { error: 'Failed to fetch maintenance records' },
      { status: 500 }
    );
  }
}

// POST - Create maintenance record
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    console.log('Received maintenance data:', body);

    const {
      appUserId, bankId, vehicleId, mechanicId, category, categoryAmount,
      targetKm, startKm, endKm, bankName, vehicleNumber, createdBy,
      maintenanceType = 'km-based', expiryDate, driverId, driverName
    } = body;

    // Validate common required fields
    if (!appUserId || !bankId || !vehicleId || !category) {
      console.error('Missing required fields:', { appUserId, bankId, vehicleId, category });
      return NextResponse.json(
        { error: 'Missing required fields: appUserId, bankId, vehicleId, category are required' },
        { status: 400 }
      );
    }

    // Validate based on maintenance type
    if (maintenanceType === 'km-based') {
      if (!targetKm || targetKm <= 0) {
        return NextResponse.json(
          { error: 'Target KM must be greater than 0 for km-based maintenance' },
          { status: 400 }
        );
      }
    } else if (maintenanceType === 'date-based') {
      if (!expiryDate) {
        return NextResponse.json(
          { error: 'Expiry date is required for date-based maintenance' },
          { status: 400 }
        );
      }
      // Validate driverId for Driver Licence category
      if (category === 'Driver Licence' && !driverId) {
        return NextResponse.json(
          { error: 'Driver selection is required for Driver Licence category' },
          { status: 400 }
        );
      }
    }

    // Verify that the bank exists
    const bank = await Bank.findById(bankId);
    if (!bank) {
      return NextResponse.json(
        { error: 'Bank not found' },
        { status: 404 }
      );
    }

    // Calculate status based on maintenance type
    let status = 'Pending';

    if (maintenanceType === 'km-based') {
      // Calculate total km
      const calculatedStartKm = startKm || 0;
      const calculatedEndKm = endKm || calculatedStartKm;
      const totalKm = calculatedEndKm - calculatedStartKm;

      // Determine status based on total km vs target km
      if (totalKm >= targetKm) {
        status = 'Due';
      }
    } else if (maintenanceType === 'date-based') {
      // Calculate status based on expiry date
      const expiryDateObj = new Date(expiryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expiryDateObj.setHours(0, 0, 0, 0);

      const daysUntilExpiry = Math.ceil((expiryDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry < 0) {
        status = 'Overdue';
      } else if (daysUntilExpiry <= 30) {
        status = 'Due';
      } else {
        status = 'Pending';
      }
    }

    // Handle createdBy field
    let finalCreatedBy = createdBy || appUserId;
    console.log('Using createdBy:', finalCreatedBy);

    // Build maintenance data based on type
    const maintenanceData: any = {
      appUserId,
      bankId,
      bankName: bankName || bank.bankName,
      vehicleId,
      vehicleNumber: vehicleNumber || '',
      mechanicId: mechanicId && mechanicId !== 'none' ? mechanicId : undefined,
      category,
      categoryAmount: categoryAmount || 0,
      maintenanceType,
      status,
      isNotificationSent: false,
      isCompleted: false,
      createdBy: finalCreatedBy,
      // Default KM fields to 0 to satisfy validation if model schema is stale
      startKm: 0,
      targetKm: 0,
      endKm: 0,
      totalKm: 0
    };

    // Add km-based fields if applicable
    if (maintenanceType === 'km-based') {
      const calculatedStartKm = startKm || 0;
      const calculatedEndKm = endKm || calculatedStartKm;
      maintenanceData.startKm = calculatedStartKm;
      maintenanceData.targetKm = targetKm;
      maintenanceData.endKm = calculatedEndKm;
      maintenanceData.totalKm = calculatedEndKm - calculatedStartKm;
    }

    // Add date-based fields if applicable
    if (maintenanceType === 'date-based') {
      maintenanceData.expiryDate = new Date(expiryDate);
      if (driverId) {
        maintenanceData.driverId = driverId;
        maintenanceData.driverName = driverName || '';
      }
    }

    console.log('Creating maintenance record with data:', maintenanceData);

    const maintenance = await Maintenance.create(maintenanceData);
    console.log('Maintenance record created successfully:', maintenance._id);

    // Populate the created record for response
    const populatedMaintenance = await Maintenance.findById(maintenance._id)
      .populate('appUserId', 'name')
      .populate('vehicleId', 'vehicleNumber')
      .populate('bankId', 'bankName')
      .populate({
        path: 'mechanicId',
        select: 'name phone',
        match: { _id: { $exists: true } }
      });

    return NextResponse.json(populatedMaintenance, { status: 201 });
  } catch (error) {
    console.error('Error creating maintenance record:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return NextResponse.json(
      { error: 'Failed to create maintenance record', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT - Update maintenance records (for km tracking)
export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { vehicleId } = body;

    if (!vehicleId) {
      return NextResponse.json(
        { error: 'Vehicle ID is required' },
        { status: 400 }
      );
    }

    // Get latest trip for the vehicle
    const latestTrip = await Trip.findOne({ vehicleId })
      .sort({ createdAt: -1 });

    if (!latestTrip) {
      return NextResponse.json({ message: 'No trips found for vehicle' });
    }

    // Update all pending maintenance records for this vehicle
    const pendingMaintenance = await Maintenance.find({
      vehicleId,
      status: { $in: ['Pending', 'Due'] }
    });

    const updatedRecords = [];

    for (const maintenance of pendingMaintenance) {
      const newEndKm = latestTrip.endKm || 0;
      const newTotalKm = newEndKm - maintenance.startKm;

      let newStatus = maintenance.status;

      // Check if maintenance is due
      if (newTotalKm >= maintenance.targetKm) {
        newStatus = 'Due';
      } else if (newTotalKm > maintenance.targetKm * 1.1) { // 10% overdue
        newStatus = 'Overdue';
      }

      const updated = await Maintenance.findByIdAndUpdate(
        maintenance._id,
        {
          endKm: newEndKm,
          totalKm: newTotalKm,
          status: newStatus
        },
        { new: true }
      );

      updatedRecords.push(updated);
    }

    return NextResponse.json(updatedRecords);
  } catch (error) {
    console.error('Error updating maintenance records:', error);
    return NextResponse.json(
      { error: 'Failed to update maintenance records' },
      { status: 500 }
    );
  }
}