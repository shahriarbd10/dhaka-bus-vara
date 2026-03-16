import express from "express";
import { z } from "zod";
import { calculateFare, getActiveRuleInfo, searchStations } from "../services/fareService.js";

const router = express.Router();

router.get("/stations", async (req, res, next) => {
  try {
    const query = String(req.query.query || "");
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : undefined;

    const stations = await searchStations(query, limit);

    res.json({
      success: true,
      stations
    });
  } catch (error) {
    next(error);
  }
});

router.get("/fare/rules", async (req, res, next) => {
  try {
    const ruleInfo = await getActiveRuleInfo();
    res.json({
      success: true,
      ...ruleInfo
    });
  } catch (error) {
    next(error);
  }
});

const fareRequestSchema = z.object({
  origin: z.string().min(1, "Origin is required"),
  destination: z.string().min(1, "Destination is required"),
  distanceKm: z.any().optional()
});

router.post("/fare/calculate", async (req, res, next) => {
  try {
    const parsed = fareRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body",
        issues: parsed.error.flatten()
      });
    }

    const distanceRaw = parsed.data.distanceKm;
    const distanceNum =
      distanceRaw === undefined || distanceRaw === null || distanceRaw === ""
        ? null
        : Number(distanceRaw);

    const result = await calculateFare({
      origin: parsed.data.origin,
      destination: parsed.data.destination,
      distanceKm: Number.isFinite(distanceNum) ? distanceNum : null
    });

    res.json({
      success: true,
      result
    });
  } catch (error) {
    next(error);
  }
});

export default router;
