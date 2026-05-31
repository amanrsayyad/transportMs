import mongoose, { Schema, Document } from 'mongoose';

// Date-based maintenance categories
export const DATE_BASED_CATEGORIES = [
  'TAX',
  'Fitness',
  'Insurance',
  'PUC',
  'Permit',
  'Environment Tax',
  'Driver Licence'
] as const;

export type DateBasedCategory = typeof DATE_BASED_CATEGORIES[number];

export interface IMaintenance extends Document {
  appUserId: mongoose.Types.ObjectId;
  bankId: mongoose.Types.ObjectId;
  bankName: string;
  vehicleId: mongoose.Types.ObjectId;
  vehicleNumber: string;
  mechanicId?: mongoose.Types.ObjectId;
  category: string;
  categoryAmount?: number;
  // Maintenance type: km-based (default) or date-based
  maintenanceType: 'km-based' | 'date-based';
  // KM-based fields (optional for date-based)
  startKm?: number;
  targetKm?: number;
  endKm?: number;
  totalKm?: number;
  // Date-based fields
  expiryDate?: Date;
  // Driver fields (for Driver Licence category)
  driverId?: mongoose.Types.ObjectId;
  driverName?: string;
  status: 'Pending' | 'Due' | 'Completed' | 'Overdue';
  isNotificationSent: boolean;
  isCompleted: boolean;
  isMonitoring?: boolean;
  monitoringStartedAt?: Date;
  monitoringStoppedAt?: Date;
  lastCheckedAt?: Date;
  completedAt?: Date;
  notificationStatus?: 'Accepted' | 'Declined';
  declinedAt?: Date;
  expenseId?: mongoose.Types.ObjectId;
  transactionId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceSchema = new Schema<IMaintenance>({
  appUserId: { type: Schema.Types.ObjectId, ref: 'AppUser', required: true },
  bankId: { type: Schema.Types.ObjectId, ref: 'Bank', required: true },
  bankName: { type: String, required: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  vehicleNumber: { type: String, required: true },
  mechanicId: { type: Schema.Types.ObjectId, ref: 'Mechanic', required: false },
  category: { type: String, required: true },
  categoryAmount: { type: Number, required: false },
  // Maintenance type: km-based (default) or date-based
  maintenanceType: {
    type: String,
    enum: ['km-based', 'date-based'],
    default: 'km-based'
  },
  // KM-based fields (optional - only required for km-based maintenance)
  startKm: { type: Number, required: false, default: 0 },
  targetKm: { type: Number, required: false, default: 0 },
  endKm: { type: Number, default: 0 },
  totalKm: { type: Number, default: 0 },
  // Date-based fields
  expiryDate: { type: Date, required: false },
  // Driver fields (for Driver Licence category)
  driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: false },
  driverName: { type: String, required: false },
  status: {
    type: String,
    enum: ['Pending', 'Due', 'Completed', 'Overdue'],
    default: 'Pending'
  },
  isNotificationSent: { type: Boolean, default: false },
  isCompleted: { type: Boolean, default: false },
  isMonitoring: { type: Boolean, default: false },
  monitoringStartedAt: { type: Date },
  monitoringStoppedAt: { type: Date },
  lastCheckedAt: { type: Date },
  completedAt: { type: Date },
  notificationStatus: { type: String, enum: ['Accepted', 'Declined'] },
  declinedAt: { type: Date },
  expenseId: { type: Schema.Types.ObjectId, ref: 'Expense' },
  transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, {
  timestamps: true
});

// Index for efficient queries
MaintenanceSchema.index({ vehicleId: 1, status: 1 });
MaintenanceSchema.index({ appUserId: 1 });
MaintenanceSchema.index({ status: 1, isNotificationSent: 1 });
MaintenanceSchema.index({ maintenanceType: 1 });
MaintenanceSchema.index({ expiryDate: 1 });
MaintenanceSchema.index({ driverId: 1 });

export default mongoose.models.Maintenance || mongoose.model<IMaintenance>('Maintenance', MaintenanceSchema);