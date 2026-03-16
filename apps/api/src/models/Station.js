import mongoose from "mongoose";

const stationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    normalizedName: { type: String, required: true, unique: true, index: true },
    aliases: { type: [String], default: [] },
    area: { type: String, default: "Dhaka" }
  },
  { timestamps: true }
);

export const Station = mongoose.model("Station", stationSchema);
