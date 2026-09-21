import { describe, expect, it } from "vitest";
import { mapRowsToTemplate, type RawCell, type RawRow } from "../mapRows";
import { ImportValidationError } from "../errors";

const HEADER = [
  "Section Name",
  "Item Name",
  "Comment Name",
  "Comment Text",
  "Comment Type (info, limit, defect)",
  "Category (-1: Low, 0: Med, 1: High)",
  "Multiple Choice Options (comma-separated)",
  "Unit Type Options (numeric answers only, comma-separated)",
  "Recommendation (from list)",
  "Order (w/i item)",
  "Answer Type (boolean, checkbox, date, number, range, text)",
  "Default Value",
  "Last Modified",
];

function row(partial: Partial<Record<string, unknown>>): RawRow {
  const base: Record<string, unknown> = {
    "Section Name": null,
    "Item Name": null,
    "Comment Name": null,
    "Comment Text": null,
    "Comment Type (info, limit, defect)": null,
    "Category (-1: Low, 0: Med, 1: High)": null,
    "Multiple Choice Options (comma-separated)": null,
    "Unit Type Options (numeric answers only, comma-separated)": null,
    "Recommendation (from list)": null,
    "Order (w/i item)": null,
    "Answer Type (boolean, checkbox, date, number, range, text)": null,
    "Default Value": null,
    "Last Modified": null,
    ...partial,
  };
  return HEADER.map((h) => base[h]) as RawRow;
}

describe("mapRowsToTemplate", () => {
  it("parses a valid export into sections -> items -> comments", () => {
    const rows = [
      row({ "Section Name": "Roof", "Item Name": "Coverings", "Comment Name": "Material", "Answer Type (boolean, checkbox, date, number, range, text)": "checkbox" }),
      row({ "Section Name": "Roof", "Item Name": "Coverings", "Comment Name": "Damaged", "Comment Text": "<p>Roof covering damaged.</p>", "Comment Type (info, limit, defect)": "defect" }),
      row({ "Section Name": "Roof", "Item Name": "Flashings", "Comment Name": "Missing", "Comment Type (info, limit, defect)": "defect" }),
      row({ "Section Name": "Exterior", "Item Name": "General", "Comment Name": "Inspection Method", "Comment Type (info, limit, defect)": "info" }),
    ];
    const result = mapRowsToTemplate(HEADER, rows);

    expect(result.stats).toEqual({ sectionsCount: 2, itemsCount: 3, commentsCount: 4, rowsRead: 4 });
    expect(result.sections[0].name).toBe("Roof");
    expect(result.sections[0].items[0].name).toBe("Coverings");
    expect(result.sections[0].items[0].comments.map((c) => c.name)).toEqual(["Material", "Damaged"]);
    expect(result.sections[1].name).toBe("Exterior");
    expect(result.warnings).toHaveLength(0);
  });

  it("preserves hierarchy and ordering across repeated section/item names", () => {
    const rows = [
      row({ "Section Name": "Roof", "Item Name": "General", "Comment Name": "A" }),
      row({ "Section Name": "Exterior", "Item Name": "General", "Comment Name": "B" }),
      row({ "Section Name": "Roof", "Item Name": "General", "Comment Name": "C" }),
    ];
    const result = mapRowsToTemplate(HEADER, rows);

    // Two distinct "General" items scoped to their own sections, not merged.
    expect(result.stats.sectionsCount).toBe(2);
    expect(result.stats.itemsCount).toBe(2);
    const roofGeneral = result.sections.find((s) => s.name === "Roof")!.items[0];
    expect(roofGeneral.comments.map((c) => c.name)).toEqual(["A", "C"]);
    expect(roofGeneral.comments[0].position).toBe(0);
    expect(roofGeneral.comments[1].position).toBe(1);
  });

  it("keeps duplicate comment names as separate comments and warns", () => {
    const rows = [
      row({ "Section Name": "Fireplace", "Item Name": "Damper Doors", "Comment Name": "Damper Inoperable", "Comment Text": "Version one." }),
      row({ "Section Name": "Fireplace", "Item Name": "Damper Doors", "Comment Name": "Damper Inoperable", "Comment Text": "Version two." }),
    ];
    const result = mapRowsToTemplate(HEADER, rows);

    expect(result.stats.commentsCount).toBe(2);
    const comments = result.sections[0].items[0].comments;
    expect(comments).toHaveLength(2);
    expect(comments[0].textHtml).toBe("Version one.");
    expect(comments[1].textHtml).toBe("Version two.");
    expect(result.warnings.some((w) => w.message.includes("Duplicate comment name"))).toBe(true);
  });

  it("skips rows missing required identifying fields and reports a warning, without crashing", () => {
    const rows = [
      row({ "Section Name": "Roof", "Item Name": "Coverings", "Comment Name": "Material" }),
      row({ "Section Name": "Roof", "Item Name": "", "Comment Name": "Orphan" }), // missing item name
      row({ "Section Name": "Roof", "Item Name": "Coverings", "Comment Name": "Damaged" }),
    ];
    const result = mapRowsToTemplate(HEADER, rows);

    expect(result.stats.commentsCount).toBe(2);
    expect(result.stats.rowsRead).toBe(3);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].level).toBe("warning");
    expect(result.warnings[0].rowNumber).toBe(3);
  });

  it("skips fully blank spreadsheet rows silently (no data to preserve or warn about)", () => {
    const rows = [
      row({ "Section Name": "Roof", "Item Name": "Coverings", "Comment Name": "Material" }),
      Array(HEADER.length).fill(null),
      row({ "Section Name": "Roof", "Item Name": "Coverings", "Comment Name": "Damaged" }),
    ];
    const result = mapRowsToTemplate(HEADER, rows);
    expect(result.stats.commentsCount).toBe(2);
    expect(result.stats.rowsRead).toBe(2);
  });

  it("decodes HTML entities in plain-text name fields", () => {
    const rows = [
      row({ "Section Name": "Basement, Foundation, Crawlspace &amp; Structure", "Item Name": "General", "Comment Name": "X" }),
    ];
    const result = mapRowsToTemplate(HEADER, rows);
    expect(result.sections[0].name).toBe("Basement, Foundation, Crawlspace & Structure");
  });

  it("sanitizes comment HTML and warns about stripped tags, without dropping the comment", () => {
    const rows = [
      row({
        "Section Name": "Doors",
        "Item Name": "Interior",
        "Comment Name": "Damaged",
        "Comment Text": '<p>See <a href="javascript:alert(1)">this</a> and <script>alert(1)</script> also <img src=x>.</p>',
      }),
    ];
    const result = mapRowsToTemplate(HEADER, rows);
    const comment = result.sections[0].items[0].comments[0];
    expect(comment.textHtml).not.toContain("javascript:");
    expect(comment.textHtml).not.toContain("<script");
    expect(comment.textHtml).not.toContain("<img");
    expect(result.warnings.some((w) => w.message.includes("unsupported HTML"))).toBe(true);
  });

  it("preserves safe http links in comment HTML", () => {
    const rows = [
      row({
        "Section Name": "Doors",
        "Item Name": "Interior",
        "Comment Name": "Damaged",
        "Comment Text": '<p>See <a href="https://example.com/repair">this guide</a>.</p>',
      }),
    ];
    const result = mapRowsToTemplate(HEADER, rows);
    const comment = result.sections[0].items[0].comments[0];
    expect(comment.textHtml).toContain('href="https://example.com/repair"');
  });

  it("parses multiple choice options into a clean array", () => {
    const rows = [
      row({ "Section Name": "S", "Item Name": "I", "Comment Name": "C", "Multiple Choice Options (comma-separated)": "Furnished, Utilities Off, Occupied, Vacant" }),
    ];
    const result = mapRowsToTemplate(HEADER, rows);
    expect(result.sections[0].items[0].comments[0].multipleChoiceOptions).toEqual([
      "Furnished",
      "Utilities Off",
      "Occupied",
      "Vacant",
    ]);
  });

  it("flags non-numeric Category values instead of silently coercing them", () => {
    const rows = [
      row({ "Section Name": "S", "Item Name": "I", "Comment Name": "C", "Category (-1: Low, 0: Med, 1: High)": "N/A" }),
    ];
    const result = mapRowsToTemplate(HEADER, rows);
    expect(result.sections[0].items[0].comments[0].severity).toBeNull();
    expect(result.warnings.some((w) => w.message.includes("non-numeric Category"))).toBe(true);
  });

  it("throws ImportValidationError when required columns are missing (malformed export)", () => {
    const badHeader = ["Name", "Description"];
    const rows = [["Roof", "Something"]];
    expect(() => mapRowsToTemplate(badHeader, rows)).toThrow(ImportValidationError);
  });

  it("warns about unrecognized extra columns without failing the import", () => {
    const headerWithExtra = [...HEADER, "Some New Column"];
    const rows = [
      [...row({ "Section Name": "S", "Item Name": "I", "Comment Name": "C" }), "unexpected value"],
    ];
    const result = mapRowsToTemplate(headerWithExtra, rows);
    expect(result.stats.commentsCount).toBe(1);
    expect(result.warnings.some((w) => w.message.includes("Some New Column"))).toBe(true);
  });

  describe("Default Photo columns", () => {
    // Header order: ...HEADER, then Photo 1 url/caption, Photo 2 url/caption.
    const PHOTO_HEADER = [
      ...HEADER,
      "Default Photo 1",
      "Default Photo 1 Caption",
      "Default Photo 2",
      "Default Photo 2 Caption",
    ];

    function photoRow(
      base: Partial<Record<string, unknown>>,
      photo1Url: RawCell = null,
      photo1Caption: RawCell = null,
      photo2Url: RawCell = null,
      photo2Caption: RawCell = null
    ): RawRow {
      return [...row(base), photo1Url, photo1Caption, photo2Url, photo2Caption];
    }

    it("captures a real Default Photo URL and caption into sourceMetadata, per row", () => {
      const rows = [
        photoRow(
          {
            "Section Name": "Structural Components",
            "Item Name": "Foundation, Basement & Crawlspaces",
            "Comment Name": "Material",
          },
          "https://cdn.spectora.com/default_photos/images/005/616/856/original/spectora_full_logo_white.png?1789939930",
          "Sample caption"
        ),
      ];
      const result = mapRowsToTemplate(PHOTO_HEADER, rows);
      const comment = result.sections[0].items[0].comments[0];
      const meta = comment.sourceMetadata as { photos?: { slot: number; url: string; caption: string | null }[] };
      expect(meta.photos).toEqual([
        {
          slot: 1,
          url: "https://cdn.spectora.com/default_photos/images/005/616/856/original/spectora_full_logo_white.png?1789939930",
          caption: "Sample caption",
        },
      ]);
      // Not reported as unrecognized now that it's a supported column.
      expect(result.warnings.some((w) => w.message.includes("Default Photo 1"))).toBe(false);
    });

    it("does not treat an empty photo field as meaningful content", () => {
      const rows = [photoRow({ "Section Name": "S", "Item Name": "I", "Comment Name": "C" })];
      const result = mapRowsToTemplate(PHOTO_HEADER, rows);
      const comment = result.sections[0].items[0].comments[0];
      const meta = comment.sourceMetadata as { photos?: unknown };
      expect(meta.photos).toBeUndefined();
      expect(result.warnings).toHaveLength(0);
    });

    it("rejects an unsafe photo URL scheme and warns instead of storing it", () => {
      const rows = [
        photoRow({ "Section Name": "S", "Item Name": "I", "Comment Name": "C" }, "javascript:alert(1)"),
      ];
      const result = mapRowsToTemplate(PHOTO_HEADER, rows);
      const comment = result.sections[0].items[0].comments[0];
      const meta = comment.sourceMetadata as { photos?: unknown };
      expect(meta.photos).toBeUndefined();
      expect(result.warnings.some((w) => w.message.includes("unsupported URL scheme"))).toBe(true);
    });
  });
});
