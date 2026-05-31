import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Maintenance from '@/models/Maintenance';
import Trip from '@/models/Trip';
import Vehicle from '@/models/Vehicle';

// POST - Start continuous monitoring for a maintenance record
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { maintenanceId } = body;

    if (!maintenanceId) {
      return NextResponse.json(
        { error: 'Maintenance ID is required' },
        { status: 400 }
      );
    }

    // Find the maintenance record
    const maintenance = await Maintenance.findById(maintenanceId);
    if (!maintenance) {
      return NextResponse.json(
        { error: 'Maintenance record not found' },
        { status: 404 }
      );
    }

    // Start monitoring by updating the record
    await Maintenance.findByIdAndUpdate(maintenanceId, {
      isMonitoring: true,
      monitoringStartedAt: new Date()
    });

    return NextResponse.json({
      message: 'Monitoring started successfully',
      maintenanceId
    });
  } catch (error) {
    console.error('Error starting maintenance monitoring:', error);
    return NextResponse.json(
      { error: 'Failed to start monitoring' },
      { status: 500 }
    );
  }
}

// GET - Check and update maintenance records based on latest trip data and expiry dates
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Find all active maintenance records that need monitoring
    const activeMaintenanceRecords = await Maintenance.find({
      status: { $in: ['Pending', 'Due'] },
      isCompleted: false
    }).populate('vehicleId');

    const updatedRecords = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to midnight for accurate date comparison

    for (const maintenance of activeMaintenanceRecords) {
      try {
        let newStatus = maintenance.status;
        let shouldTriggerNotification = false;
        let notificationCreated = null;

        // Handle date-based maintenance
        if (maintenance.maintenanceType === 'date-based' && maintenance.expiryDate) {
          const expiryDate = new Date(maintenance.expiryDate);
          expiryDate.setHours(0, 0, 0, 0);

          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          // Check if maintenance is due (within 30 days or expired)
          if (daysUntilExpiry <= 30) {
            if (maintenance.status !== 'Due' && maintenance.status !== 'Overdue' && !maintenance.isNotificationSent) {
              newStatus = daysUntilExpiry < 0 ? 'Overdue' : 'Due';
              shouldTriggerNotification = true;

              // Create a new notification record
              try {
                const maintenanceNotification = new Maintenance({
                  appUserId: maintenance.appUserId,
                  bankId: maintenance.bankId,
                  bankName: maintenance.bankName,
                  vehicleId: maintenance.vehicleId,
                  vehicleNumber: maintenance.vehicleNumber,
                  category: maintenance.category,
                  categoryAmount: maintenance.categoryAmount,
                  maintenanceType: 'date-based',
                  expiryDate: maintenance.expiryDate,
                  driverId: maintenance.driverId,
                  driverName: maintenance.driverName,
                  status: newStatus,
                  isCompleted: false,
                  isNotificationSent: true,
                  createdBy: maintenance.createdBy,
                  createdAt: new Date(),
                  updatedAt: new Date()
                });

                await maintenanceNotification.save();
                notificationCreated = maintenanceNotification._id;
                console.log(`Date-based notification created for maintenance ${maintenance._id}: ${notificationCreated}`);
              } catch (notificationError) {
                console.error('Error creating date-based notification:', notificationError);
              }
            } else if (daysUntilExpiry < 0 && maintenance.status !== 'Overdue') {
              // Update to Overdue if already expired
              newStatus = 'Overdue';
            }
          }

          // Update the original maintenance record
          await Maintenance.findByIdAndUpdate(
            maintenance._id,
            {
              status: newStatus,
              isNotificationSent: shouldTriggerNotification ? true : maintenance.isNotificationSent,
              lastCheckedAt: new Date()
            },
            { new: true }
          );

          updatedRecords.push({
            maintenanceId: maintenance._id,
            vehicleId: maintenance.vehicleId,
            maintenanceType: 'date-based',
            expiryDate: maintenance.expiryDate,
            daysUntilExpiry,
            status: newStatus,
            notificationTriggered: shouldTriggerNotification,
            notificationId: notificationCreated
          });
        }
        // Handle KM-based maintenance
        else if (maintenance.maintenanceType === 'km-based') {
          // Get the latest trip for this vehicle
          const latestTrip = await Trip.findOne({
            vehicleId: maintenance.vehicleId
          }).sort({ createdAt: -1 });

          if (latestTrip) {
            const currentKm = latestTrip.endKm;
            const kmTraveled = currentKm - maintenance.startKm;

            if (kmTraveled >= maintenance.targetKm) {
              if (maintenance.status !== 'Due' && maintenance.status !== 'Overdue' && !maintenance.isNotificationSent) {
                newStatus = 'Due';
                shouldTriggerNotification = true;

                // Create a new notification record
                try {
                  const maintenanceNotification = new Maintenance({
                    appUserId: maintenance.appUserId,
                    bankId: maintenance.bankId,
                    bankName: maintenance.bankName,
                    vehicleId: maintenance.vehicleId,
                    vehicleNumber: maintenance.vehicleNumber,
                    category: maintenance.category,
                    categoryAmount: maintenance.categoryAmount,
                    maintenanceType: 'km-based',
                    targetKm: maintenance.targetKm,
                    startKm: maintenance.startKm,
                    endKm: currentKm,
                    totalKm: kmTraveled,
                    status: 'Due',
                    isCompleted: false,
                    isNotificationSent: true,
                    createdBy: maintenance.createdBy,
                    createdAt: new Date(),
                    updatedAt: new Date()
                  });

                  await maintenanceNotification.save();
                  notificationCreated = maintenanceNotification._id;
                  console.log(`KM-based notification created for maintenance ${maintenance._id}: ${notificationCreated}`);
                } catch (notificationError) {
                  console.error('Error creating KM-based notification:', notificationError);
                }
              }

              // Check if overdue (10% over target)
              if (kmTraveled > maintenance.targetKm * 1.1) {
                newStatus = 'Overdue';
              }
            }

            // Update the original maintenance record
            await Maintenance.findByIdAndUpdate(
              maintenance._id,
              {
                endKm: currentKm,
                totalKm: kmTraveled,
                status: newStatus,
                isNotificationSent: shouldTriggerNotification ? true : maintenance.isNotificationSent,
                lastCheckedAt: new Date()
              },
              { new: true }
            );

            updatedRecords.push({
              maintenanceId: maintenance._id,
              vehicleId: maintenance.vehicleId,
              maintenanceType: 'km-based',
              currentKm,
              kmTraveled,
              targetKm: maintenance.targetKm,
              status: newStatus,
              notificationTriggered: shouldTriggerNotification,
              notificationId: notificationCreated
            });
          }
        }
      } catch (error) {
        console.error(`Error updating maintenance ${maintenance._id}:`, error);
      }
    }

    return NextResponse.json({
      message: 'Maintenance monitoring check completed',
      updatedRecords,
      totalChecked: activeMaintenanceRecords.length
    });
  } catch (error) {
    console.error('Error in maintenance monitoring:', error);
    return NextResponse.json(
      { error: 'Failed to check maintenance records' },
      { status: 500 }
    );
  }
}

// PUT - Update monitoring settings for a maintenance record
export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { maintenanceId, isMonitoring } = body;

    if (!maintenanceId) {
      return NextResponse.json(
        { error: 'Maintenance ID is required' },
        { status: 400 }
      );
    }

    const updateData: any = { isMonitoring };
    if (isMonitoring) {
      updateData.monitoringStartedAt = new Date();
    } else {
      updateData.monitoringStoppedAt = new Date();
    }

    const updatedMaintenance = await Maintenance.findByIdAndUpdate(
      maintenanceId,
      updateData,
      { new: true }
    );

    if (!updatedMaintenance) {
      return NextResponse.json(
        { error: 'Maintenance record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: `Monitoring ${isMonitoring ? 'started' : 'stopped'} successfully`,
      maintenance: updatedMaintenance
    });
  } catch (error) {
    console.error('Error updating maintenance monitoring:', error);
    return NextResponse.json(
      { error: 'Failed to update monitoring settings' },
      { status: 500 }
    );
  }
}