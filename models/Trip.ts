import mongoose, { Schema, Document } from 'mongoose';

export interface IExpense {
  category: string;
  amount: number;
  quantity: number;
  total: number;
  description?: string;
}

export interface IAppUserExpense {
  appUserId: mongoose.Types.ObjectId;
  appUserName: string;
  bankId: mongoose.Types.ObjectId;
  bankName: string;
  category: string;
  amount: number;
  description?: string;
  expenseId?: mongoose.Types.ObjectId;
}

export interface IRouteWiseExpenseBreakdown {
  routeNumber: number;
  startLocation: string;
  endLocation: string;
  firstToLocation?: string;
  chalanNo?: string;
  productName: string;
  weight: number;
  rate: number;
  routeAmount: number;
  rows?: {
    productName: string;
    weight: number;
    rate: number;
    total: number;
    chalanNo?: string;
  }[];
  advanceAmount?: number;
  advanceAmounts?: { label: string; amount: number; paymentType?: string; paymentReceived?: 'driver' | 'appuser' }[];
  dates?: Date[];
  userId: mongoose.Types.ObjectId;
  userName: string;
  customerId: mongoose.Types.ObjectId;
  customerName: string;
  bankName: string;
  bankId: mongoose.Types.ObjectId;
  paymentType: string;
  // Indicates who received the payment for the route
  paymentReceived?: 'driver' | 'appuser';
  routeStatus: 'Draft' | 'In Progress' | 'Completed' | 'Cancelled';
  locations?: {
    from: string;
    to: string;
    status: 'empty' | 'filled';
  }[];
  expenses: IExpense[];
  appUserExpenses?: IAppUserExpense[];
  totalExpense: number;
  totalAppUserExpense?: number;
}

export interface ITrip extends Document {
  tripId: string;
  date: Date[];
  startKm: number;
  endKm: number;
  totalKm: number;
  driverId: mongoose.Types.ObjectId;
  driverName: string;
  vehicleId: mongoose.Types.ObjectId;
  vehicleNumber: string;
  status: 'Draft' | 'In Progress' | 'Completed' | 'Cancelled';
  remarks?: string;
  routeWiseExpenseBreakdown: IRouteWiseExpenseBreakdown[];
  tripRouteCost: number;
  tripExpenses: number;
  tripDiselCost: number;
  fuelNeededForTrip: number;
  totalTripKm: number;
  remainingAmount: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseSchema = new Schema<IExpense>({
  category: { type: String, required: true },
  amount: { type: Number, required: true },
  quantity: { type: Number, required: true },
  total: { type: Number, required: true },
  description: { type: String }
});

const AppUserExpenseSchema = new Schema<IAppUserExpense>({
  appUserId: { type: Schema.Types.ObjectId, ref: 'AppUser', required: true },
  appUserName: { type: String, required: true },
  bankId: { type: Schema.Types.ObjectId, ref: 'Bank', required: true },
  bankName: { type: String, required: true },
  category: { type: String, required: true },
  amount: { type: Number, required: true },
  description: { type: String },
  expenseId: { type: Schema.Types.ObjectId, ref: 'Expense' },
});

const RouteWiseExpenseBreakdownSchema = new Schema<IRouteWiseExpenseBreakdown>({
  routeNumber: { type: Number, required: true },
  startLocation: { type: String, required: true },
  endLocation: { type: String, required: true },
  firstToLocation: { type: String, default: '' },
  chalanNo: { type: String, default: '' },
  productName: { type: String, required: true },
  weight: { type: Number, required: true },
  rate: { type: Number, required: true },
  routeAmount: { type: Number, required: true },
  rows: [{
    productName: { type: String, required: true },
    weight: { type: Number, required: true },
    rate: { type: Number, required: true },
    total: { type: Number, required: true, default: 0 },
    chalanNo: { type: String, default: '' },
  }],
  advanceAmount: { type: Number, default: 0 },
  advanceAmounts: [{
    label: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    paymentType: { type: String, default: 'Cash' },
    paymentReceived: { type: String, enum: ['driver', 'appuser'], default: 'appuser' },
  }],
  dates: [{ type: Date }],
  userId: { type: Schema.Types.ObjectId, ref: 'AppUser', required: true },
  userName: { type: String, required: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName: { type: String, required: true },
  bankName: { type: String, required: true },
  bankId: { type: Schema.Types.ObjectId, ref: 'Bank', required: true },
  paymentType: {
    type: String,
    required: true,
    enum: ['Cash', 'UPI', 'Net Banking', 'Credit Card', 'Debit Card', 'Cheque']
  },
  paymentReceived: { type: String, enum: ['driver', 'appuser'], default: 'appuser' },
  routeStatus: {
    type: String,
    enum: ['Draft', 'In Progress', 'Completed', 'Cancelled'],
    default: 'In Progress'
  },
  locations: [{
    from: String,
    to: String,
    status: {
      type: String,
      enum: ['empty', 'filled'],
      default: 'empty'
    }
  }],
  expenses: [ExpenseSchema],
  appUserExpenses: [AppUserExpenseSchema],
  totalExpense: { type: Number, required: true },
  totalAppUserExpense: { type: Number, default: 0 }
});

const TripSchema = new Schema<ITrip>({
  tripId: { type: String, required: true, unique: true },
  date: [{ type: Date, required: true }],
  startKm: { type: Number, required: true },
  endKm: { type: Number, required: true },
  totalKm: { type: Number, required: true },
  driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
  driverName: { type: String, required: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  vehicleNumber: { type: String, required: true },
  status: {
    type: String,
    enum: ['Draft', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Draft'
  },
  remarks: { type: String },
  routeWiseExpenseBreakdown: [RouteWiseExpenseBreakdownSchema],
  tripRouteCost: { type: Number, required: true },
  tripExpenses: { type: Number, required: true },
  tripDiselCost: { type: Number, required: true },
  fuelNeededForTrip: { type: Number, required: true },
  totalTripKm: { type: Number, required: true },
  remainingAmount: { type: Number, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'AppUser', required: true }
}, {
  timestamps: true
});

// Pre-save middleware to calculate fields
TripSchema.pre('save', function (next) {
  // Calculate totalKm
  this.totalKm = this.endKm - this.startKm;

  // Calculate per-route app user expense totals
  this.routeWiseExpenseBreakdown = this.routeWiseExpenseBreakdown.map((route: any) => {
    const appUserTotal = (route.appUserExpenses || []).reduce((s: number, r: any) => s + Number(r?.amount || 0), 0);
    return {
      ...route,
      totalAppUserExpense: Number(appUserTotal || 0),
    };
  });

  // Calculate tripRouteCost (sum of all route amounts minus app user expenses)
  this.routeWiseExpenseBreakdown = this.routeWiseExpenseBreakdown.map((route: any) => {
    const baseTotal = Number(route.rate || 0) * Number(route.weight || 0);
    const rows = Array.isArray(route.rows) ? route.rows.map((row: any) => {
      const total = Number(row.rate || 0) * Number(row.weight || 0);
      return { ...row, total };
    }) : [];
    const rowsTotal = rows.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    const routeAmount = Number(baseTotal + rowsTotal);
    return { ...route, rows, routeAmount };
  });
  const totalRouteAmount = this.routeWiseExpenseBreakdown.reduce((sum, route: any) => sum + Number(route.routeAmount || 0), 0);
  const totalAppUserExpenses = this.routeWiseExpenseBreakdown.reduce((sum, route: any) => sum + Number(route.totalAppUserExpense || 0), 0);
  this.tripRouteCost = Number(totalRouteAmount - totalAppUserExpenses);

  // Calculate tripExpenses (sum of all expenses)
  this.tripExpenses = this.routeWiseExpenseBreakdown.reduce((sum, route) => sum + route.totalExpense, 0);

  // Calculate remainingAmount
  this.remainingAmount = this.tripRouteCost - this.tripExpenses - this.tripDiselCost;

  // Coerce per-route advanceAmount to number to avoid accidental 0 defaults
  // If advanceAmounts array exists, compute advanceAmount as the sum
  this.routeWiseExpenseBreakdown = this.routeWiseExpenseBreakdown.map((route: any) => {
    const advanceAmounts = Array.isArray(route?.advanceAmounts) ? route.advanceAmounts : [];
    const computedAdvance = advanceAmounts.length > 0
      ? advanceAmounts.reduce((sum: number, a: any) => sum + (Number(a?.amount) || 0), 0)
      : Number(route?.advanceAmount ?? 0);
    return {
      ...route,
      advanceAmounts,
      advanceAmount: computedAdvance,
      totalExpense: Number(route?.totalExpense ?? 0),
      totalAppUserExpense: Number(route?.totalAppUserExpense ?? 0)
    };
  });

  next();
});

export default mongoose.models.Trip || mongoose.model<ITrip>('Trip', TripSchema);
