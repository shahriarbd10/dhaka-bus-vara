import fs from "node:fs/promises";
import path from "node:path";
import { connectToDatabase } from "../config/db.js";
import { FareChart } from "../models/FareChart.js";
import { parseGovernmentFarePdf } from "../services/pdfParser.js";
import { replaceChartData } from "../services/fareService.js";

async function run() {
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.error("Usage: npm run import:pdf --workspace apps/api -- <absolute-pdf-path>");
    process.exit(1);
  }

  await connectToDatabase();

  const fileBuffer = await fs.readFile(pdfPath);
  const parsed = await parseGovernmentFarePdf(fileBuffer);

  if (parsed.routes.length === 0 && !parsed.perKmBdt) {
    console.error("No valid route rows or per-km rule found in PDF.");
    process.exit(1);
  }

  await FareChart.updateMany({ isActive: true }, { $set: { isActive: false } });

  const chart = await FareChart.create({
    fileName: path.basename(pdfPath),
    mimeType: "application/pdf",
    sizeBytes: fileBuffer.byteLength,
    uploadedBy: "script",
    rawText: parsed.rawText,
    parserWarnings: parsed.warnings,
    isActive: true,
    summary: {
      routeCount: parsed.routes.length,
      stationCount: parsed.stationNames.length,
      unmatchedLineCount: parsed.unmatchedLineCount,
      perKmBdt: parsed.perKmBdt
    }
  });

  const synced = await replaceChartData({
    chartId: chart._id,
    routes: parsed.routes,
    perKmBdt: parsed.perKmBdt
  });

  console.log("Import complete", {
    chartId: String(chart._id),
    routes: synced.routeCount,
    stations: synced.stationCount,
    perKmBdt: synced.activeRule?.perKmBdt ?? null
  });

  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
