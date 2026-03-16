import mongoose from "mongoose";

const fareRuleSchema = new mongoose.Schema(
  {
    perKmBdt: { type: Number, required: true },
    minimumFare: { type: Number, default: 0 },
    sourceChart: { type: mongoose.Schema.Types.ObjectId, ref: "FareChart", required: true },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export const FareRule = mongoose.model("FareRule", fareRuleSchema);
