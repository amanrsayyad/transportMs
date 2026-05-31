import mongoose from 'mongoose';

const FuelQuickAddSchema = new mongoose.Schema(
  {
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
    },
    fuelQuantity: {
      type: Number,
      required: true,
      min: 0.0001,
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
    },
    description: {
      type: String,
    },
  },
  { timestamps: true }
);

export default mongoose.models.FuelQuickAdd || mongoose.model('FuelQuickAdd', FuelQuickAddSchema);