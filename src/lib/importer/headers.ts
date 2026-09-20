/**
 * Spectora's "Export HTML Text" header row uses labels like:
 *   "Category (-1: Low, 0: Med, 1: High)"
 *   "Answer Type (boolean, checkbox, date, number, range, text)"
 * The parenthetical part is a hint for humans, not part of the identity of
 * the column. We normalize by stripping it (and case/whitespace) so the
 * importer keeps working if a future export tweaks the hint text, reorders
 * columns, or adds new ones we don't recognize - as long as the core label
 * matches, we find the column.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/\(.*?\)/g, "") // drop parenthetical hints
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Canonical column -> the normalized header text we look for.
// Every export in this format is expected to use these labels; anything
// else found in the sheet is preserved per-row in sourceMetadata rather
// than silently discarded.
export const CANONICAL_COLUMNS = {
  sectionName: "section name",
  itemName: "item name",
  commentName: "comment name",
  commentText: "comment text",
  commentType: "comment type",
  category: "category",
  multipleChoiceOptions: "multiple choice options",
  unitTypeOptions: "unit type options",
  recommendation: "recommendation",
  order: "order",
  answerType: "answer type",
  defaultValue: "default value",
  defaultValue2: "default value 2",
  defaultUnitType: "default unit type",
  defaultLocation: "default location",
  defaultEstimateMin: "default estimate min",
  defaultEstimateMax: "default estimate max",
  locked: "locked",
  simpleFormat: "simple format",
  disablePhotos: "disable photos",
  uses: "uses",
  lastModified: "last modified",
} as const;

export type CanonicalColumnKey = keyof typeof CANONICAL_COLUMNS;

export const REQUIRED_COLUMNS: CanonicalColumnKey[] = ["sectionName", "itemName", "commentName"];

/**
 * Maps each canonical column to the actual column index found in the
 * uploaded sheet's header row (or undefined if that column is absent from
 * this particular export).
 */
export function resolveColumnIndexes(
  headerRow: string[]
): Partial<Record<CanonicalColumnKey, number>> {
  const normalized = headerRow.map((h) => normalizeHeader(h ?? ""));
  const result: Partial<Record<CanonicalColumnKey, number>> = {};

  for (const [key, label] of Object.entries(CANONICAL_COLUMNS)) {
    const idx = normalized.findIndex((h) => h === label);
    if (idx !== -1) {
      result[key as CanonicalColumnKey] = idx;
    } else if (key === "category") {
      // Some exports may not truncate the label the same way; also accept
      // headers that start with "category" as a fallback.
      const fallbackIdx = normalized.findIndex((h) => h.startsWith("category"));
      if (fallbackIdx !== -1) result[key as CanonicalColumnKey] = fallbackIdx;
    }
  }

  return result;
}
