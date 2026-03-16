import { FareChart } from "../models/FareChart.js";
import { FareEdge } from "../models/FareEdge.js";
import { FareRule } from "../models/FareRule.js";
import { Station } from "../models/Station.js";
import { extractStationCandidatesFromRawText } from "./pdfParser.js";
import { normalizeStationName, safeRegex } from "../utils/normalize.js";

async function upsertStations(stationNames) {
  const uniqueByNormalized = new Map();

  for (const name of stationNames) {
    const normalized = normalizeStationName(name);
    if (!normalized) {
      continue;
    }

    if (!uniqueByNormalized.has(normalized)) {
      uniqueByNormalized.set(normalized, name.trim());
    }
  }

  const operations = Array.from(uniqueByNormalized.entries()).map(([normalizedName, originalName]) => ({
    updateOne: {
      filter: { normalizedName },
      update: {
        $setOnInsert: {
          name: originalName,
          normalizedName,
          aliases: [originalName]
        },
        $addToSet: {
          aliases: originalName
        }
      },
      upsert: true
    }
  }));

  if (operations.length > 0) {
    await Station.bulkWrite(operations, { ordered: false });
  }

  const stations = await Station.find({
    normalizedName: { $in: Array.from(uniqueByNormalized.keys()) }
  });

  const stationMap = new Map();
  for (const station of stations) {
    stationMap.set(station.normalizedName, station);
  }

  return stationMap;
}

async function hydrateStationsFromActiveChart(limit = 5000) {
  const activeChart = await FareChart.findOne({ isActive: true }).sort({ createdAt: -1 }).select("rawText").lean();
  const names = extractStationCandidatesFromRawText(activeChart?.rawText || "", Math.max(1, Number(limit) || 5000));

  if (names.length === 0) {
    return 0;
  }

  await upsertStations(names);
  return names.length;
}
export async function replaceChartData({ chartId, routes, perKmBdt }) {
  const stationNames = routes.flatMap((route) => [route.origin, route.destination]);
  const stationMap = await upsertStations(stationNames);

  await FareEdge.deleteMany({ sourceChart: chartId });

  const fareDocs = [];
  for (const route of routes) {
    const originStation = stationMap.get(normalizeStationName(route.origin));
    const destinationStation = stationMap.get(normalizeStationName(route.destination));

    if (!originStation || !destinationStation) {
      continue;
    }

    fareDocs.push({
      originStation: originStation._id,
      destinationStation: destinationStation._id,
      fareBdt: route.fareBdt,
      distanceKm: route.distanceKm,
      sourceChart: chartId
    });
  }

  if (fareDocs.length > 0) {
    await FareEdge.insertMany(fareDocs, { ordered: false });
  }

  await FareRule.updateMany({ isActive: true }, { $set: { isActive: false } });

  let activeRule = null;
  if (perKmBdt && perKmBdt > 0) {
    activeRule = await FareRule.create({
      perKmBdt,
      minimumFare: 0,
      sourceChart: chartId,
      isActive: true
    });
  }

  return {
    stationCount: stationMap.size,
    routeCount: fareDocs.length,
    activeRule
  };
}

export async function searchStations(query = "", limit = 50) {
  const trimmed = query.trim();
  const normalizedLimit = Number.isFinite(Number(limit))
    ? Math.max(1, Math.min(5000, Number(limit)))
    : 50;

  const selectFields = "name aliases area";

  if (!trimmed) {
    let stations = await Station.find({}).sort({ name: 1 }).limit(normalizedLimit).select(selectFields);

    if (stations.length === 0) {
      await hydrateStationsFromActiveChart(normalizedLimit);
      stations = await Station.find({}).sort({ name: 1 }).limit(normalizedLimit).select(selectFields);
    }

    return stations;
  }

  const normalized = normalizeStationName(trimmed);
  const regex = new RegExp(safeRegex(normalized), "i");

  let stations = await Station.find({
    $or: [{ normalizedName: regex }, { aliases: { $elemMatch: { $regex: regex } } }, { name: { $regex: regex } }]
  })
    .sort({ name: 1 })
    .limit(Math.min(normalizedLimit, 100))
    .select(selectFields);

  if (stations.length === 0) {
    await hydrateStationsFromActiveChart(normalizedLimit);

    stations = await Station.find({
      $or: [{ normalizedName: regex }, { aliases: { $elemMatch: { $regex: regex } } }, { name: { $regex: regex } }]
    })
      .sort({ name: 1 })
      .limit(Math.min(normalizedLimit, 100))
      .select(selectFields);
  }

  return stations;
}
async function resolveStation(input) {
  const normalized = normalizeStationName(input);

  if (!normalized) {
    return null;
  }

  const regex = new RegExp(safeRegex(normalized), "i");

  let station = await Station.findOne({ normalizedName: normalized });
  if (station) {
    return station;
  }

  station = await Station.findOne({
    $or: [{ normalizedName: regex }, { aliases: { $elemMatch: { $regex: regex } } }, { name: { $regex: regex } }]
  });

  if (station) {
    return station;
  }

  await hydrateStationsFromActiveChart(5000);

  return Station.findOne({
    $or: [{ normalizedName: regex }, { aliases: { $elemMatch: { $regex: regex } } }, { name: { $regex: regex } }]
  });
}

function calculatePerKmFare({ perKmBdt, minimumFare, distanceKm }) {
  const rawFare = Number(distanceKm) * Number(perKmBdt);
  const finalFare = Math.max(rawFare, Number(minimumFare || 0));
  return Math.round(finalFare);
}

export async function getActiveRuleInfo() {
  const [chart, rule] = await Promise.all([
    FareChart.findOne({ isActive: true }).sort({ createdAt: -1 }).lean(),
    FareRule.findOne({ isActive: true }).sort({ createdAt: -1 }).lean()
  ]);

  return {
    chart,
    rule
  };
}

export async function calculateFare({ origin, destination, distanceKm = null }) {
  const [chart, rule] = await Promise.all([
    FareChart.findOne({ isActive: true }).sort({ createdAt: -1 }),
    FareRule.findOne({ isActive: true }).sort({ createdAt: -1 })
  ]);

  if (!chart) {
    return {
      status: "no_active_chart",
      message: "No active fare chart is available."
    };
  }

  const [originStation, destinationStation] = await Promise.all([
    resolveStation(origin),
    resolveStation(destination)
  ]);

  if (!originStation || !destinationStation) {
    return {
      status: "station_not_found",
      message: "Could not match one or both stations from the active chart.",
      originFound: Boolean(originStation),
      destinationFound: Boolean(destinationStation)
    };
  }

  if (String(originStation._id) === String(destinationStation._id)) {
    return {
      status: "ok",
      basis: "same_station",
      fareBdt: 0,
      origin: originStation.name,
      destination: destinationStation.name,
      chartId: chart._id
    };
  }

  const edge = await FareEdge.findOne({
    sourceChart: chart._id,
    $or: [
      { originStation: originStation._id, destinationStation: destinationStation._id },
      { originStation: destinationStation._id, destinationStation: originStation._id }
    ]
  });

  if (edge) {
    return {
      status: "ok",
      basis: "chart",
      fareBdt: edge.fareBdt,
      distanceKm: edge.distanceKm,
      origin: originStation.name,
      destination: destinationStation.name,
      chartId: chart._id
    };
  }

  if (rule && distanceKm && Number(distanceKm) > 0) {
    return {
      status: "ok",
      basis: "per_km_estimate",
      fareBdt: calculatePerKmFare({
        perKmBdt: rule.perKmBdt,
        minimumFare: rule.minimumFare,
        distanceKm
      }),
      distanceKm: Number(distanceKm),
      perKmBdt: rule.perKmBdt,
      origin: originStation.name,
      destination: destinationStation.name,
      chartId: chart._id
    };
  }

  return {
    status: "fare_not_found",
    message: "Direct fare not found. Provide distance to use per-km estimate.",
    origin: originStation.name,
    destination: destinationStation.name,
    perKmBdt: rule?.perKmBdt ?? null,
    minimumFare: rule?.minimumFare ?? null,
    chartId: chart._id
  };
}







