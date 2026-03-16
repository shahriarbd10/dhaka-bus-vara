import express from "express";
import multer from "multer";
import { FareChart } from "../models/FareChart.js";
import { FareEdge } from "../models/FareEdge.js";
import { FareRule } from "../models/FareRule.js";
import { createHttpError, getUploadLimitBytes } from "../middleware/errorHandler.js";
import { replaceChartData } from "../services/fareService.js";
import { parseGovernmentFarePdf } from "../services/pdfParser.js";
import { normalizeStationName } from "../utils/normalize.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: getUploadLimitBytes()
  }
});

function mergeRoutes(routes, warnings) {
  const merged = new Map();

  for (const route of routes) {
    const originKey = normalizeStationName(route.origin);
    const destinationKey = normalizeStationName(route.destination);

    if (!originKey || !destinationKey) {
      continue;
    }

    const key = `${originKey}->${destinationKey}`;
    const previous = merged.get(key);

    if (
      previous &&
      (previous.fareBdt !== route.fareBdt || Number(previous.distanceKm || 0) !== Number(route.distanceKm || 0))
    ) {
      warnings.push(
        `Duplicate route overridden: ${route.origin} -> ${route.destination} (${previous.fareBdt} to ${route.fareBdt})`
      );
    }

    merged.set(key, route);
  }

  return Array.from(merged.values());
}

function collectUploadedFiles(filesObject) {
  const charts = Array.isArray(filesObject?.charts) ? filesObject.charts : [];
  const singleChart = Array.isArray(filesObject?.chart) ? filesObject.chart : [];
  return [...charts, ...singleChart];
}

function countUniqueStations(routes) {
  const stationNames = new Set();
  for (const route of routes) {
    stationNames.add(route.origin);
    stationNames.add(route.destination);
  }
  return stationNames.size;
}

function parseManualCsv(manualCsv = "") {
  const rows = String(manualCsv)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const routes = [];

  for (const row of rows) {
    const [origin, destination, fareRaw, distanceRaw] = row.split(",").map((token) => token?.trim());

    const fareBdt = Number(fareRaw);
    const distanceKm = distanceRaw ? Number(distanceRaw) : null;

    if (!origin || !destination || !Number.isFinite(fareBdt) || fareBdt <= 0) {
      continue;
    }

    routes.push({
      origin,
      destination,
      fareBdt: Math.round(fareBdt),
      distanceKm: Number.isFinite(distanceKm) ? distanceKm : null,
      rawLine: row,
      sourceFileName: "manual_update"
    });
  }

  return routes;
}

function isForceFlag(value) {
  return ["1", "true", "yes", "y"].includes(String(value || "").toLowerCase());
}

async function activateChartById(chart, { force = false } = {}) {
  const routeCount = await FareEdge.countDocuments({ sourceChart: chart._id });
  const perKmBdt = chart?.summary?.perKmBdt ?? null;
  const hasUsableData = routeCount > 0 || Boolean(perKmBdt);

  if (!hasUsableData && !force) {
    throw createHttpError(
      409,
      "This dataset has no extracted fares yet. Use Add/Update + Activate, or Force Activate."
    );
  }

  await FareChart.updateMany({ isActive: true }, { $set: { isActive: false } });
  chart.isActive = true;
  await chart.save();

  await FareRule.updateMany({ isActive: true }, { $set: { isActive: false } });

  if (perKmBdt && perKmBdt > 0) {
    const existingRule = await FareRule.findOne({ sourceChart: chart._id }).sort({ createdAt: -1 });

    if (existingRule) {
      existingRule.perKmBdt = perKmBdt;
      existingRule.isActive = true;
      await existingRule.save();
    } else {
      await FareRule.create({
        perKmBdt,
        minimumFare: 0,
        sourceChart: chart._id,
        isActive: true
      });
    }
  }

  return { routeCount, perKmBdt, hasUsableData };
}

router.post(
  "/chart",
  upload.fields([
    { name: "charts", maxCount: 30 },
    { name: "chart", maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      const files = collectUploadedFiles(req.files);

      if (files.length === 0) {
        throw createHttpError(400, "Please upload PDF file(s) in form-data key: charts (or chart).");
      }

      const sourceFiles = [];
      const parsedRoutes = [];
      const parserWarnings = [];
      const rawTextParts = [];
      const perKmCandidates = [];
      let unmatchedLineCount = 0;
      let totalSizeBytes = 0;

      for (const file of files) {
        const isPdf = file.mimetype?.includes("pdf") || file.originalname?.toLowerCase().endsWith(".pdf");

        if (!isPdf) {
          throw createHttpError(400, `File is not a PDF: ${file.originalname}`);
        }

        const parsed = await parseGovernmentFarePdf(file.buffer);
        sourceFiles.push(file.originalname);
        totalSizeBytes += file.size;
        unmatchedLineCount += parsed.unmatchedLineCount;

        if (parsed.rawText) {
          rawTextParts.push(`### ${file.originalname}\n${parsed.rawText}`);
        }

        for (const route of parsed.routes) {
          parsedRoutes.push({ ...route, sourceFileName: file.originalname });
        }

        if (parsed.perKmBdt) {
          perKmCandidates.push({ fileName: file.originalname, value: parsed.perKmBdt });
        }

        for (const warning of parsed.warnings) {
          parserWarnings.push(`[${file.originalname}] ${warning}`);
        }
      }

      const effectiveRoutes = mergeRoutes(parsedRoutes, parserWarnings);

      if (perKmCandidates.length > 1) {
        const uniquePerKm = Array.from(new Set(perKmCandidates.map((item) => item.value)));
        if (uniquePerKm.length > 1) {
          parserWarnings.push(
            `Multiple per-km values found across files (${uniquePerKm.join(", ")}). Latest file value will be used.`
          );
        }
      }

      const latestPerKmFromFiles = perKmCandidates.length
        ? perKmCandidates[perKmCandidates.length - 1].value
        : null;

      const hasUsableData = effectiveRoutes.length > 0 || Boolean(latestPerKmFromFiles);

      if (!hasUsableData) {
        parserWarnings.push("No route/per-km data could be extracted, so this upload is saved as inactive.");
      }

      if (hasUsableData) {
        await FareChart.updateMany({ isActive: true }, { $set: { isActive: false } });
      }

      const chart = await FareChart.create({
        fileName:
          files.length === 1
            ? files[0].originalname
            : `Merged Dhaka Fare Chart (${files.length} PDFs)`,
        mimeType: "application/pdf",
        sizeBytes: totalSizeBytes,
        uploadedBy: req.admin?.email || "admin",
        rawText: rawTextParts.join("\n\n"),
        parserWarnings,
        sourceCount: files.length,
        sourceFiles,
        isActive: hasUsableData,
        summary: {
          routeCount: effectiveRoutes.length,
          stationCount: countUniqueStations(effectiveRoutes),
          unmatchedLineCount,
          perKmBdt: latestPerKmFromFiles
        }
      });

      let replaced = {
        stationCount: 0,
        routeCount: 0,
        activeRule: null
      };

      if (hasUsableData) {
        replaced = await replaceChartData({
          chartId: chart._id,
          routes: effectiveRoutes,
          perKmBdt: latestPerKmFromFiles
        });
      }

      res.status(201).json({
        success: true,
        message: hasUsableData
          ? `Merged ${files.length} PDF(s) and synced into MongoDB.`
          : "PDF(s) uploaded, but parser could not extract usable fare data. Kept as inactive.",
        chart: {
          id: chart._id,
          fileName: chart.fileName,
          uploadedAt: chart.createdAt,
          isActive: chart.isActive,
          sourceCount: chart.sourceCount,
          sourceFiles: chart.sourceFiles,
          summary: chart.summary,
          parserWarnings: chart.parserWarnings.slice(0, 20)
        },
        synced: {
          stations: replaced.stationCount,
          routes: replaced.routeCount,
          perKmBdt: replaced.activeRule?.perKmBdt ?? null
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

router.put("/charts/:chartId/activate", async (req, res, next) => {
  try {
    const { chartId } = req.params;
    const force = isForceFlag(req.query.force);

    const chart = await FareChart.findById(chartId);
    if (!chart) {
      throw createHttpError(404, "Dataset not found.");
    }

    const activation = await activateChartById(chart, { force });

    return res.json({
      success: true,
      message: activation.hasUsableData
        ? "Dataset activated successfully."
        : "Dataset force-activated (no extracted fares found).",
      activation
    });
  } catch (error) {
    next(error);
  }
});

router.put("/charts/:chartId/update-and-activate", async (req, res, next) => {
  try {
    const { chartId } = req.params;
    const chart = await FareChart.findById(chartId);

    if (!chart) {
      throw createHttpError(404, "Dataset not found.");
    }

    const manualRoutes = parseManualCsv(req.body?.manualCsv || "");
    const perKmRaw = req.body?.perKmBdt;
    const perKmParsed = perKmRaw === undefined || perKmRaw === null || perKmRaw === "" ? null : Number(perKmRaw);
    const manualPerKm = Number.isFinite(perKmParsed) && perKmParsed > 0 ? Number(perKmParsed) : null;

    if (manualRoutes.length === 0 && !manualPerKm) {
      throw createHttpError(400, "Provide manual CSV routes or a per-km value.");
    }

    const existingEdges = await FareEdge.find({ sourceChart: chart._id })
      .populate("originStation", "name")
      .populate("destinationStation", "name")
      .lean();

    const existingRoutes = existingEdges
      .filter((edge) => edge.originStation?.name && edge.destinationStation?.name)
      .map((edge) => ({
        origin: edge.originStation.name,
        destination: edge.destinationStation.name,
        fareBdt: edge.fareBdt,
        distanceKm: edge.distanceKm,
        sourceFileName: "existing_dataset"
      }));

    const warnings = Array.isArray(chart.parserWarnings) ? [...chart.parserWarnings] : [];
    const mergedRoutes = mergeRoutes([...existingRoutes, ...manualRoutes], warnings);

    const effectivePerKm = manualPerKm ?? chart.summary?.perKmBdt ?? null;

    if (mergedRoutes.length === 0 && !effectivePerKm) {
      throw createHttpError(400, "Dataset still has no usable fare data after update.");
    }

    await FareChart.updateMany({ isActive: true }, { $set: { isActive: false } });

    const synced = await replaceChartData({
      chartId: chart._id,
      routes: mergedRoutes,
      perKmBdt: effectivePerKm
    });

    chart.isActive = true;
    chart.parserWarnings = [...warnings, `Manual update applied on ${new Date().toISOString()}`].slice(-40);
    chart.summary = {
      ...chart.summary,
      routeCount: mergedRoutes.length,
      stationCount: countUniqueStations(mergedRoutes),
      perKmBdt: effectivePerKm
    };

    await chart.save();

    return res.json({
      success: true,
      message: "Dataset updated and activated successfully.",
      synced: {
        stations: synced.stationCount,
        routes: synced.routeCount,
        perKmBdt: synced.activeRule?.perKmBdt ?? effectivePerKm ?? null
      }
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/charts/:chartId", async (req, res, next) => {
  try {
    const { chartId } = req.params;
    const chart = await FareChart.findById(chartId);

    if (!chart) {
      throw createHttpError(404, "Dataset package not found.");
    }

    const deletedPackage = {
      id: chart._id,
      fileName: chart.fileName,
      sourceCount: chart.sourceCount ?? chart.sourceFiles?.length ?? 1,
      sourceFiles: chart.sourceFiles || [],
      createdAt: chart.createdAt
    };

    const [edgeDelete, ruleDelete] = await Promise.all([
      FareEdge.deleteMany({ sourceChart: chart._id }),
      FareRule.deleteMany({ sourceChart: chart._id })
    ]);

    const wasActive = Boolean(chart.isActive);
    await chart.deleteOne();

    let reactivated = null;

    if (wasActive) {
      const fallbackChart = await FareChart.findOne({ _id: { $ne: chart._id } }).sort({ createdAt: -1 });

      if (fallbackChart) {
        try {
          const activation = await activateChartById(fallbackChart, { force: false });
          reactivated = {
            id: fallbackChart._id,
            fileName: fallbackChart.fileName,
            routeCount: activation.routeCount,
            perKmBdt: activation.perKmBdt ?? null
          };
        } catch {
          reactivated = null;
        }
      }
    }

    return res.json({
      success: true,
      message: "Dataset package deleted successfully.",
      deletedPackage,
      deleted: {
        routes: edgeDelete.deletedCount ?? 0,
        rules: ruleDelete.deletedCount ?? 0
      },
      reactivated
    });
  } catch (error) {
    next(error);
  }
});
router.get("/charts", async (req, res, next) => {
  try {
    const charts = await FareChart.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .select("fileName uploadedBy isActive sourceCount sourceFiles summary createdAt parserWarnings");

    res.json({
      success: true,
      charts
    });
  } catch (error) {
    next(error);
  }
});

router.get("/chart/latest", async (req, res, next) => {
  try {
    const chart = await FareChart.findOne({ isActive: true }).sort({ createdAt: -1 });

    if (!chart) {
      return res.status(404).json({
        success: false,
        message: "No active fare chart found."
      });
    }

    res.json({
      success: true,
      chart
    });
  } catch (error) {
    next(error);
  }
});

export default router;


