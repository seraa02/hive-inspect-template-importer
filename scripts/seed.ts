// Env vars are loaded via `node --env-file` in the npm script (see
// package.json) - that runs before any module code, avoiding ESM import-
// hoisting issues that would otherwise load src/db/client.ts (which reads
// process.env at module scope) before dotenv had a chance to run.
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { importSpectoraExport } from "../src/lib/importer";
import { commitImport, listTemplates } from "../src/db/repo";

/**
 * Seeds the database with the committed Spectora export, so a freshly
 * deployed app opens with a real, already-imported template instead of an
 * empty state. Safe to re-run: it skips seeding if any template already
 * exists.
 */
async function main() {
  const existing = await listTemplates();
  if (existing.length > 0) {
    console.log(`Database already has ${existing.length} template(s). Skipping seed.`);
    process.exit(0);
  }

  const projectRoot = path.resolve(__dirname, "..");
  const fixtureFilename = readdirSync(projectRoot).find(
    (f) => (f.endsWith(".xls") || f.endsWith(".xlsx")) && !f.startsWith("~$")
  );
  if (!fixtureFilename) {
    console.error("No .xls/.xlsx fixture found in the project root to seed with.");
    process.exit(1);
  }

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
