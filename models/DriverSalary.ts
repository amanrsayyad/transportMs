import mongoose from "mongoose";

const driverSalarySchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    driverName: {
      type: String,
      required: true,
    },
    monthlySalary: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      enum: ["salary", "advance"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    month: {
      type: String,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    appUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AppUser",
    },
    appUserName: {
      type: String,
    },
    bankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bank",
    },
    bankName: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
driverSalarySchema.index({ driverId: 1, month: 1, year: 1 });
driverSalarySchema.index({ date: -1 });

// Force model recompilation in development
if (mongoose.models.DriverSalary) {
  delete mongoose.models.DriverSalary;
}

const DriverSalary = mongoose.model("DriverSalary", driverSalarySchema);

export default DriverSalary;
