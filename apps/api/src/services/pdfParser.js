import { bijoyToUnicode } from "@abdalgolabs/ansi-unicode-converter";
import pdfParse from "pdf-parse";
import { normalizeStationName, normalizeText, toEnglishDigits } from "../utils/normalize.js";

function tryDecodeLine(line) {
  if (!line) {
    return "";
  }

  try {
    const decoded = bijoyToUnicode(line);
    return decoded && decoded.length ? decoded : line;
  } catch {
    return line;
  }
}

function normalizeForParsing(line) {
  return toEnglishDigits(line)
    .replace(/\u00A0/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LEGACY_DIGIT_MAP = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
  o: "0",
  O: "0",
  ")": "1",
  l: "1",
  I: "1",
  "|": "1",
  q: "2",
  Q: "2",
  v: "3",
  V: "3",
  a: "4",
  A: "4",
  e: "4",
  E: "4",
  s: "5",
  S: "5",
  c: "6",
  C: "6",
  "\\": "7",
  "/": "7",
  b: "8",
  B: "8",
  i: "9",
  j: "9"
};

function parseLegacyNumberToken(token, max = 300) {
  if (!token) {
    return null;
  }

  const normalized = toEnglishDigits(String(token).trim()).replace(/[,;]/g, "").replace(/:/g, ".");
  if (!normalized) {
    return null;
  }

  let numeric = "";
  for (const char of normalized) {
    if (/\d/.test(char) || char === "." || char === "-") {
      numeric += char;
      continue;
    }

    if (LEGACY_DIGIT_MAP[char]) {
      numeric += LEGACY_DIGIT_MAP[char];
    }
  }

  if (!/\d/.test(numeric)) {
    return null;
  }

  const dotIndex = numeric.indexOf(".");
  if (dotIndex >= 0) {
    numeric = `${numeric.slice(0, dotIndex + 1)}${numeric.slice(dotIndex + 1).replace(/\./g, "")}`;
  }

  let value = Number(numeric);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  if (value > max) {
    const left = (numeric.split(".", 1)[0] || "").replace(/\D/g, "");
    if (left.length >= 2) {
      value = Number(left.slice(0, 2));
    }
  }

  if (!Number.isFinite(value) || value <= 0 || value > max) {
    return null;
  }

  return value;
}

function cleanStationCandidate(value) {
  return String(value || "")
    .trim()
    .replace(/^[`'".,;:()[\]{}<>|/\\-]+/g, "")
    .replace(/[`'".,;:()[\]{}<>|/\\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPerKmBdt(rawText) {
  const candidateTexts = [rawText, tryDecodeLine(rawText)];
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:bdt|tk|taka|fare)\s*(?:\/|per)?\s*(?:km|kilometer|kilometre)/i,
    /(?:per)\s*(?:km|kilometer|kilometre)[^\d]{0,12}(\d+(?:\.\d+)?)/i,
    /(?:distance|km)[^\d]{0,10}(\d+(?:\.\d+)?)[^\d]{0,6}(?:bdt|tk|taka|fare)/i
  ];

  for (const text of candidateTexts) {
    const normalized = toEnglishDigits(text || "");
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match?.[1]) {
        return Number(match[1]);
      }
    }
  }

  return null;
}

function decideFareAndDistance(numbers) {
  if (numbers.length === 0) {
    return { fareBdt: null, distanceKm: null };
  }

  if (numbers.length === 1) {
    return { fareBdt: numbers[0], distanceKm: null };
  }

  const [a, b] = numbers;

  if (a <= 25 && b > 25) {
    return { fareBdt: b, distanceKm: a };
  }

  if (b <= 25 && a > 25) {
    return { fareBdt: a, distanceKm: b };
  }

  const fareBdt = Math.max(a, b);
  const distanceKm = Math.min(a, b);

  return { fareBdt, distanceKm };
}

function isLikelyStationName(name) {
  const value = (name || "").trim();
  if (value.length < 2 || value.length > 80) {
    return false;
  }

  const compact = value.replace(/\s+/g, "");
  const letters = (compact.match(/[\p{L}]/gu) || []).length;
  const digits = (compact.match(/\d/g) || []).length;
  const punctuation = Math.max(0, compact.length - letters - digits);

  if (letters < 2) {
    return false;
  }

  return punctuation / compact.length <= 0.28;
}

function splitOriginDestination(routePart, rawLine) {
  const sepMatch = routePart.match(/(.+?)\s*(?:-|to|from|->|=>)\s*(.+)/i);
  if (sepMatch) {
    return {
      origin: sepMatch[1].trim(),
      destination: sepMatch[2].trim()
    };
  }

  const slashMatch = routePart.match(/(.+?)\s*\/\s*(.+)/);
  if (slashMatch) {
    return {
      origin: slashMatch[1].trim(),
      destination: slashMatch[2].trim()
    };
  }

  const firstDigitIndex = rawLine.search(/\d/);
  if (firstDigitIndex > 0) {
    const rawRoutePart = rawLine.slice(0, firstDigitIndex).trim();
    const doubleSpaceSplit = rawRoutePart
      .split(/\s{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (doubleSpaceSplit.length >= 2) {
      return {
        origin: doubleSpaceSplit[0],
        destination: doubleSpaceSplit[1]
      };
    }
  }

  return null;
}

function parseRouteLine(line) {
  const decodedLine = tryDecodeLine(line);
  const normalizedLine = normalizeForParsing(decodedLine);

  if (!normalizedLine || !/\d/.test(normalizedLine)) {
    return null;
  }

  const firstDigitIndex = normalizedLine.search(/\d/);
  if (firstDigitIndex < 0) {
    return null;
  }

  const routePart = normalizedLine.slice(0, firstDigitIndex).trim();
  if (routePart.length < 3) {
    return null;
  }

  const numberMatches = normalizedLine.match(/\d+(?:\.\d+)?/g);
  if (!numberMatches || numberMatches.length === 0) {
    return null;
  }

  const numbers = numberMatches.map(Number).filter((value) => Number.isFinite(value));
  const { fareBdt, distanceKm } = decideFareAndDistance(numbers);

  if (!fareBdt || fareBdt <= 0 || fareBdt > 5000) {
    return null;
  }

  const routeSplit = splitOriginDestination(routePart, decodedLine);
  if (!routeSplit) {
    return null;
  }

  const origin = routeSplit.origin.trim();
  const destination = routeSplit.destination.trim();

  if (!origin || !destination) {
    return null;
  }

  if (!isLikelyStationName(origin) || !isLikelyStationName(destination)) {
    return null;
  }

  if (normalizeStationName(origin) === normalizeStationName(destination)) {
    return null;
  }

  return {
    origin,
    destination,
    fareBdt: Math.round(fareBdt),
    distanceKm: distanceKm ? Number(distanceKm.toFixed(2)) : null,
    rawLine: line
  };
}

function parseLegacyTableRow(line) {
  const tokens = String(line || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length < 3) {
    return null;
  }

  let firstNumericIndex = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    const parsed = parseLegacyNumberToken(tokens[index], 500);
    if (parsed !== null) {
      firstNumericIndex = index;
      break;
    }
  }

  if (firstNumericIndex <= 0) {
    return null;
  }

  const stationCandidate = cleanStationCandidate(tokens.slice(0, firstNumericIndex).join(" "));
  if (!stationCandidate || /\d/.test(stationCandidate) || !isLikelyStationName(stationCandidate)) {
    return null;
  }

  const parsedNumbers = tokens
    .slice(firstNumericIndex)
    .map((token) => parseLegacyNumberToken(token, 500))
    .filter((value) => Number.isFinite(value));

  if (parsedNumbers.length < 2) {
    return null;
  }

  const distanceKm = parsedNumbers.find((value) => value > 0 && value <= 80) ?? null;
  const fareFromOrigin =
    parsedNumbers.slice(1).find((value) => value >= 5 && value <= 250) ??
    parsedNumbers.find((value) => value >= 5 && value <= 250) ??
    null;

  if (!fareFromOrigin) {
    return null;
  }

  return {
    station: stationCandidate,
    distanceKm: distanceKm ? Number(distanceKm.toFixed(2)) : null,
    fareFromOrigin: Math.round(fareFromOrigin),
    rawLine: line
  };
}

function dedupeLegacyRows(rows) {
  const seen = new Set();
  const output = [];

  for (const row of rows) {
    const normalized = normalizeStationName(row.station);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(row);
  }

  return output;
}

function buildRoutesFromLegacyRows(rows) {
  const deduped = dedupeLegacyRows(rows).slice(0, 30);
  if (deduped.length < 2) {
    return [];
  }

  const routeMap = new Map();

  for (let i = 0; i < deduped.length - 1; i += 1) {
    for (let j = i + 1; j < deduped.length; j += 1) {
      const origin = deduped[i].station;
      const destination = deduped[j].station;
      const normOrigin = normalizeStationName(origin);
      const normDestination = normalizeStationName(destination);

      if (!normOrigin || !normDestination || normOrigin === normDestination) {
        continue;
      }

      const distanceKm =
        deduped[i].distanceKm !== null && deduped[j].distanceKm !== null
          ? Number(Math.abs(deduped[j].distanceKm - deduped[i].distanceKm).toFixed(2))
          : null;

      const fareDelta = Math.abs(deduped[j].fareFromOrigin - deduped[i].fareFromOrigin);
      const fareBdt = Math.max(10, Math.round(fareDelta));
      if (!fareBdt || fareBdt > 500) {
        continue;
      }

      const routeKey =
        normOrigin < normDestination ? `${normOrigin}->${normDestination}` : `${normDestination}->${normOrigin}`;
      const existing = routeMap.get(routeKey);

      if (!existing || fareBdt < existing.fareBdt) {
        routeMap.set(routeKey, {
          origin,
          destination,
          fareBdt,
          distanceKm: distanceKm && distanceKm > 0 ? distanceKm : null,
          rawLine: `${deduped[i].rawLine} | ${deduped[j].rawLine}`
        });
      }
    }
  }

  return Array.from(routeMap.values());
}

function estimatePerKmFromRoutes(routes) {
  const ratios = routes
    .filter((route) => Number.isFinite(route.distanceKm) && route.distanceKm > 0.5 && Number.isFinite(route.fareBdt))
    .map((route) => route.fareBdt / route.distanceKm)
    .filter((ratio) => ratio >= 0.5 && ratio <= 20)
    .sort((a, b) => a - b);

  if (ratios.length < 5) {
    return null;
  }

  return Number(ratios[Math.floor(ratios.length / 2)].toFixed(2));
}

function rebuildLegacyRowLinesFromTokenLines(tokenLines) {
  const rebuilt = [];
  let stationTokens = [];
  let numberTokens = [];

  const flush = () => {
    if (stationTokens.length > 0 && numberTokens.length >= 2) {
      rebuilt.push(`${stationTokens.join(" ")} ${numberTokens.join(" ")}`);
    }
    stationTokens = [];
    numberTokens = [];
  };

  for (const tokenLine of tokenLines) {
    const token = String(tokenLine || "").trim();
    if (!token) {
      continue;
    }

    const asNumber = parseLegacyNumberToken(token, 500);
    if (asNumber !== null) {
      if (stationTokens.length > 0) {
        numberTokens.push(token);
      }

      if (numberTokens.length > 14) {
        flush();
      }
      continue;
    }

    if (numberTokens.length >= 2) {
      flush();
    }

    if (!isLikelyStationName(token)) {
      if (stationTokens.length > 0 && numberTokens.length > 0) {
        flush();
      }
      stationTokens = [];
      numberTokens = [];
      continue;
    }

    if (stationTokens.length >= 4) {
      stationTokens = [token];
      numberTokens = [];
      continue;
    }

    stationTokens.push(token);
  }

  flush();
  return rebuilt;
}

function splitLegacyRowsIntoSegments(rows) {
  const segments = [];
  let current = [];
  let previousDistance = null;

  const closeCurrent = () => {
    if (current.length >= 2) {
      segments.push(current);
    }
    current = [];
    previousDistance = null;
  };

  for (const row of rows) {
    const distance = Number.isFinite(row.distanceKm) ? row.distanceKm : null;

    if (current.length === 0) {
      current.push(row);
      previousDistance = distance;
      continue;
    }

    const shouldBreakByDistance =
      Number.isFinite(previousDistance) && Number.isFinite(distance) && distance + 2 < previousDistance;
    const shouldBreakBySize = current.length >= 18;

    if (shouldBreakByDistance || shouldBreakBySize) {
      closeCurrent();
      current.push(row);
      previousDistance = distance;
      continue;
    }

    current.push(row);
    if (Number.isFinite(distance)) {
      previousDistance = distance;
    }
  }

  closeCurrent();
  return segments;
}

function parseLegacyFromRawTokenStream(tokenLines) {
  const rebuiltRowLines = rebuildLegacyRowLinesFromTokenLines(tokenLines);
  if (rebuiltRowLines.length === 0) {
    return null;
  }

  const rows = rebuiltRowLines.map((line) => parseLegacyTableRow(line)).filter(Boolean);
  if (rows.length < 2) {
    return null;
  }

  const segments = splitLegacyRowsIntoSegments(rows);
  if (segments.length === 0) {
    return null;
  }

  const routeMap = new Map();
  const stationSet = new Set();

  for (const segment of segments) {
    const segmentRoutes = buildRoutesFromLegacyRows(segment);
    for (const route of segmentRoutes) {
      const normOrigin = normalizeStationName(route.origin);
      const normDestination = normalizeStationName(route.destination);
      const key =
        normOrigin < normDestination ? `${normOrigin}->${normDestination}` : `${normDestination}->${normOrigin}`;

      routeMap.set(key, route);
      stationSet.add(route.origin);
      stationSet.add(route.destination);
    }
  }

  const routes = Array.from(routeMap.values());
  if (routes.length === 0) {
    return null;
  }

  return {
    routes,
    stationNames: Array.from(stationSet),
    perKmEstimate: estimatePerKmFromRoutes(routes)
  };
}


export function extractStationCandidatesFromRawText(rawText = "", limit = 5000) {
  const lines = String(rawText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const stationByNormalized = new Map();
  const addStation = (name) => {
    const cleaned = String(name || "").trim();
    const normalized = normalizeStationName(cleaned);
    if (!cleaned || !normalized || stationByNormalized.has(normalized)) {
      return;
    }
    stationByNormalized.set(normalized, cleaned);
  };

  for (const line of lines) {
    const parsedRoute = parseRouteLine(line);
    if (!parsedRoute) {
      continue;
    }

    addStation(parsedRoute.origin);
    addStation(parsedRoute.destination);
  }

  if (stationByNormalized.size === 0) {
    const legacyParsed = parseLegacyFromRawTokenStream(lines);
    for (const name of legacyParsed?.stationNames || []) {
      addStation(name);
    }
  }

  return Array.from(stationByNormalized.values()).slice(0, Math.max(1, Number(limit) || 5000));
}
export async function parseGovernmentFarePdf(pdfBuffer) {
  const parsed = await pdfParse(pdfBuffer);
  const rawText = parsed.text || "";

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const routes = [];
  const warnings = [];
  let unmatchedLineCount = 0;
  const routeMap = new Map();

  for (const line of lines) {
    const parsedRoute = parseRouteLine(line);

    if (!parsedRoute) {
      const normalized = normalizeText(tryDecodeLine(line));
      if (/\d/.test(normalized) && normalized.length > 8) {
        unmatchedLineCount += 1;
      }
      continue;
    }

    const routeKey = `${normalizeStationName(parsedRoute.origin)}->${normalizeStationName(parsedRoute.destination)}`;
    routeMap.set(routeKey, parsedRoute);
  }

  routes.push(...routeMap.values());

  const stationNames = new Set();
  for (const route of routes) {
    stationNames.add(route.origin);
    stationNames.add(route.destination);
  }

  const strictPerKmBdt = extractPerKmBdt(rawText);
  let perKmBdt = strictPerKmBdt;

  if (routes.length === 0) {
    const legacyParsed = parseLegacyFromRawTokenStream(lines);
    if (legacyParsed?.routes?.length) {
      routes.push(...legacyParsed.routes);
      for (const name of legacyParsed.stationNames) {
        stationNames.add(name);
      }

      if (!perKmBdt && legacyParsed.perKmEstimate) {
        perKmBdt = legacyParsed.perKmEstimate;
      }

      warnings.push(
        `Used legacy token-stream fallback parser and extracted ${legacyParsed.routes.length} routes from table rows.`
      );

      if (!strictPerKmBdt && legacyParsed.perKmEstimate) {
        warnings.push(`Per-km was estimated from parsed rows: ${legacyParsed.perKmEstimate} BDT/km.`);
      }
    }
  }

  if (routes.length === 0) {
    warnings.push("No route rows were extracted. Check source PDF formatting and parser rules.");
  }

  if (!perKmBdt) {
    warnings.push("Per-km rule not found in uploaded PDF text.");
  }

  return {
    rawText,
    routes,
    stationNames: Array.from(stationNames),
    perKmBdt,
    unmatchedLineCount,
    warnings
  };
}

