import mongoose from "mongoose";

const appUserSchema = new mongoose.Schema(
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
    },
    gstin: {
      type: String,
      trim: true,
      default: undefined,
    },
    address: {
      type: String,
      trim: true,
      default: undefined,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);
appUserSchema.index({ mobileNo: 1 });

const AppUserModel = mongoose.models.AppUser || mongoose.model("AppUser", appUserSchema);

try { AppUserModel.collection.dropIndex("mobileNo_1").catch(() => {}); } catch {}

export default AppUserModel;
