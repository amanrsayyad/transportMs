import mongoose from "mongoose";

const driverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mobileNo: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    monthlySalary: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "on-leave"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

// Force model recompilation in development
if (mongoose.models.Driver) {
  delete mongoose.models.Driver;
}

const Driver = mongoose.model("Driver", driverSchema);

export default Driver;
