import mongoose from "mongoose";

const fareChartSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedBy: { type: String, default: "admin" },
    rawText: { type: String, default: "" },
    parserWarnings: { type: [String], default: [] },
    sourceCount: { type: Number, default: 1 },
    sourceFiles: { type: [String], default: [] },
    summary: {
      routeCount: { type: Number, default: 0 },
      stationCount: { type: Number, default: 0 },
      unmatchedLineCount: { type: Number, default: 0 },
      perKmBdt: { type: Number, default: null }
    },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export const FareChart = mongoose.model("FareChart", fareChartSchema);
