import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
  },
  type: {
    type: String,
    enum: ['INCOME', 'EXPENSE', 'TRANSFER', 'FUEL', 'DRIVER_BUDGET', 'BANK_UPDATE'],
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  fromBankId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bank',
  },
  toBankId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bank',
  },
  appUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AppUser',
    required: true,
  },
  relatedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  relatedEntityType: {
    type: String,
    enum: ['Income', 'Expense', 'Transfer', 'FuelTracking', 'DriverBudget', 'DriverSalary', 'Bank', 'Trip', 'BULK_INVOICE'],
  },
  subTransactions: [{
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
    },
    lrNo: String,
    customerName: String,
    amount: Number,
  }],
  category: {
    type: String,
  },
  invoiceNo: {
    type: String,
    index: true,
  },
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED'],
    default: 'COMPLETED',
  },
  balanceAfter: {
    type: Number,
  },
  date: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

export default mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);