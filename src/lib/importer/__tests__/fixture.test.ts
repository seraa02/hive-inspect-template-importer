import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { importSpectoraExport } from "../index";

/**
 * Preservation validation against the real, committed Spectora export.
 * If this file is ever swapped for a different InterNACHI/Spectora export
 * in the same format, update the expected counts below after re-running
 * the manual inspection - the importer itself must not be hard-coded to
 * these numbers (see mapRows.test.ts for the format-level, fixture-free
 * tests).
 */
const projectRoot = path.resolve(__dirname, "../../../..");
const fixtureFilename = readdirSync(projectRoot).find(
  (f) => f.toLowerCase().includes("internachi") && (f.endsWith(".xls") || f.endsWith(".xlsx"))
);

describe.skipIf(!fixtureFilename)("importSpectoraExport (real committed fixture)", () => {
  it("imports the real InterNACHI Residential export with the expected shape", async () => {
    const buffer = readFileSync(path.join(projectRoot, fixtureFilename!));
    const result = await importSpectoraExport(buffer, fixtureFilename!);

    // Counts confirmed by direct inspection of the source file (see NOTES.md).
    expect(result.stats.sectionsCount).toBe(13);
    expect(result.stats.itemsCount).toBe(69);
    expect(result.stats.commentsCount).toBe(392);
    expect(result.stats.rowsRead).toBe(392);

    // At least one duplicate-name warning is expected (Fireplace > Damper
    // Doors > "Damper Inoperable" appears twice in the real export).
    expect(result.warnings.some((w) => w.message.includes("Duplicate comment name"))).toBe(true);

    // Section/item names with HTML entities decode cleanly.
    const basement = result.sections.find((s) => s.name.startsWith("Basement"));
    expect(basement?.name).toBe("Basement, Foundation, Crawlspace & Structure");
    expect(basement?.name).not.toContain("&amp;");
  });
});
