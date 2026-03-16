import mongoose from "mongoose";

const fareEdgeSchema = new mongoose.Schema(
  {
    originStation: { type: mongoose.Schema.Types.ObjectId, ref: "Station", required: true, index: true },
    destinationStation: { type: mongoose.Schema.Types.ObjectId, ref: "Station", required: true, index: true },
    fareBdt: { type: Number, required: true },
    distanceKm: { type: Number, default: null },
    sourceChart: { type: mongoose.Schema.Types.ObjectId, ref: "FareChart", required: true, index: true }
  },
  { timestamps: true }
);

fareEdgeSchema.index(
  { originStation: 1, destinationStation: 1, sourceChart: 1 },
  { unique: true }
);

export const FareEdge = mongoose.model("FareEdge", fareEdgeSchema);
