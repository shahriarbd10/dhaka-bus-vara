import fs from "node:fs/promises";
import path from "node:path";
import { parseGovernmentFarePdf } from "../services/pdfParser.js";

async function run() {
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.error("Usage: npm run preview:pdf --workspace apps/api -- <absolute-pdf-path>");
    process.exit(1);
  }

  const buffer = await fs.readFile(pdfPath);
  const parsed = await parseGovernmentFarePdf(buffer);

  console.log("Parse preview");
  console.log({
    file: path.basename(pdfPath),
    routes: parsed.routes.length,
    stations: parsed.stationNames.length,
    perKmBdt: parsed.perKmBdt,
    unmatchedLineCount: parsed.unmatchedLineCount,
    warnings: parsed.warnings
  });

  if (parsed.routes.length) {
    console.log("Sample routes:");
    console.table(parsed.routes.slice(0, 10));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
