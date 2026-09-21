import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { importSpectoraExport } from "../index";

// Preservation validation against the real, committed Spectora export.
const projectRoot = path.resolve(__dirname, "../../../..");
const fixtureFilename = readdirSync(projectRoot).find(
  (f) => f.toLowerCase().includes("internachi") && (f.endsWith(".xls") || f.endsWith(".xlsx"))
);

describe.skipIf(!fixtureFilename)("importSpectoraExport (real committed fixture)", () => {
  it("imports the real InterNACHI Residential export with the expected shape", async () => {
    const buffer = readFileSync(path.join(projectRoot, fixtureFilename!));
    const result = await importSpectoraExport(buffer, fixtureFilename!);

    expect(result.stats.sectionsCount).toBe(13);
    expect(result.stats.itemsCount).toBe(69);
    expect(result.stats.commentsCount).toBe(392);
    expect(result.stats.rowsRead).toBe(392);

    expect(result.warnings.some((w) => w.message.includes("Duplicate comment name"))).toBe(true);

    const basement = result.sections.find((s) => s.name.startsWith("Basement"));
    expect(basement?.name).toBe("Basement, Foundation, Crawlspace & Structure");
    expect(basement?.name).not.toContain("&amp;");
  });
});
