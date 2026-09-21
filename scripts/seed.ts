import { readFileSync, readdirSync } from "fs";
import path from "path";
import { importSpectoraExport } from "../src/lib/importer";
import { commitImport, listTemplates } from "../src/db/repo";

async function main() {
  const existing = await listTemplates();
  if (existing.length > 0) {
    console.log(`Database already has ${existing.length} template(s). Skipping seed.`);
    process.exit(0);
  }

  const projectRoot = path.resolve(__dirname, "..");
  const candidates = readdirSync(projectRoot).filter(
    (f) => (f.endsWith(".xls") || f.endsWith(".xlsx")) && !f.startsWith("~$")
  );
  if (candidates.length === 0) {
    console.error("No .xls/.xlsx fixture found in the project root to seed with.");
    process.exit(1);
  }
  if (candidates.length > 1) {
    console.error(
      `Found ${candidates.length} .xls/.xlsx files in the project root - ambiguous which one to ` +
        `seed with: ${candidates.join(", ")}. Directory listing order is not guaranteed, so this ` +
        `is never resolved silently. Keep only the one export you want seeded in the project root ` +
        `(move or remove the others) and re-run.`
    );
    process.exit(1);
  }
  const fixtureFilename = candidates[0];

  console.log(`Seeding from ${fixtureFilename} ...`);
  const buffer = readFileSync(path.join(projectRoot, fixtureFilename));
  const parsed = await importSpectoraExport(buffer, fixtureFilename);

  const templateName = fixtureFilename.replace(/\.(xlsx|xls)$/i, "").trim();
  const { templateId } = await commitImport({ templateName, filename: fixtureFilename, parsed });

  console.log(
    `Seeded template "${templateName}" (${templateId}) - ${parsed.stats.sectionsCount} sections, ${parsed.stats.itemsCount} items, ${parsed.stats.commentsCount} comments, ${parsed.warnings.length} warnings.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
