import { decode } from "he";
import { ImportValidationError } from "./errors";
import { sanitizeComment } from "./sanitizeComment";
import {
  CANONICAL_COLUMNS,
  PHOTO_SLOTS,
  REQUIRED_COLUMNS,
  photoCaptionColumnKey,
  photoUrlColumnKey,
  resolveColumnIndexes,
  type CanonicalColumnKey,
} from "./headers";
import type { ImportWarning, ParsedComment, ParsedItem, ParsedSection, ParsedTemplate } from "./types";

export type RawCell = string | number | boolean | null | undefined;
export type RawRow = RawCell[];

function cellToString(v: RawCell): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function cellToNumber(v: RawCell): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

// Name fields come out of the export with literal HTML entities
// (e.g. "Crawlspace &amp; Structure") even though they're plain text.
function decodeName(v: RawCell): string | null {
  const s = cellToString(v);
  return s === null ? null : decode(s);
}

function splitList(v: RawCell): string[] | null {
  const s = cellToString(v);
  if (s === null) return null;
  const parts = s
    .split(",")
    .map((p) => decode(p.trim()))
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts : null;
}

export interface ParsedPhoto {
  slot: number;
  url: string;
  caption: string | null;
}

const ALLOWED_PHOTO_URL_SCHEMES = ["http:", "https:"];

function sanitizePhotoUrl(v: RawCell): { url: string | null; unsafe: boolean } {
  const s = cellToString(v);
  if (s === null) return { url: null, unsafe: false }; // empty photo field - not meaningful
  const isSafe = ALLOWED_PHOTO_URL_SCHEMES.some((scheme) => s.toLowerCase().startsWith(scheme));
  return isSafe ? { url: s, unsafe: false } : { url: null, unsafe: true };
}

// Pure and deterministic: turns header + data rows into a structured
// template with no I/O and no reliance on any one export's specific content.
export function mapRowsToTemplate(headerRow: RawRow, dataRows: RawRow[]): ParsedTemplate {
  const headerStrings = headerRow.map((h) => (h === null || h === undefined ? "" : String(h)));
  const columns = resolveColumnIndexes(headerStrings);

  const missingRequired = REQUIRED_COLUMNS.filter((key) => columns[key] === undefined);
  if (missingRequired.length > 0) {
    const labels = missingRequired.map((k) => CANONICAL_COLUMNS[k]).join(", ");
    throw new ImportValidationError(
      `This file is missing required column(s): ${labels}. Expected a Spectora "Export HTML Text" spreadsheet with a header row containing Section Name, Item Name, and Comment Name.`
    );
  }

  const knownIndexes = new Set(Object.values(columns));
  const unknownColumnHeaders = headerStrings
    .map((h, idx) => ({ h, idx }))
    .filter(({ h, idx }) => h.trim() !== "" && !knownIndexes.has(idx));

  const warnings: ImportWarning[] = [];
  if (unknownColumnHeaders.length > 0) {
    warnings.push({
      level: "warning",
      message: `Unrecognized column(s) present in the export and not imported into a dedicated field: ${unknownColumnHeaders
        .map((c) => `"${c.h}"`)
        .join(", ")}.`,
    });
  }

  const get = (row: RawRow, key: CanonicalColumnKey): RawCell => {
    const idx = columns[key];
    return idx === undefined ? undefined : row[idx];
  };

  const sections: ParsedSection[] = [];
  const sectionIndex = new Map<string, ParsedSection>();
  const itemIndex = new Map<string, ParsedItem>(); // key: `${sectionName}::${itemName}`
  const commentKeyCounts = new Map<string, number>(); // key: `${sectionName}::${itemName}::${commentName}`

  let rowsRead = 0;
  let commentsCount = 0;

  dataRows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for 1-indexing, +1 for header row
    const isFullyEmpty = row.every((v) => v === null || v === undefined || String(v).trim() === "");
    if (isFullyEmpty) {
      return; // truly blank spreadsheet row - nothing to preserve or warn about
    }
    rowsRead++;

    const sectionName = decodeName(get(row, "sectionName"));
    const itemName = decodeName(get(row, "itemName"));
    const commentName = decodeName(get(row, "commentName"));

    if (!sectionName || !itemName || !commentName) {
      warnings.push({
        level: "warning",
        message: `Row ${rowNumber} is missing a required value (Section Name, Item Name, or Comment Name) and was skipped.`,
        rowNumber,
      });
      return;
    }

    let section = sectionIndex.get(sectionName);
    if (!section) {
      section = { name: sectionName, position: sections.length, items: [] };
      sections.push(section);
      sectionIndex.set(sectionName, section);
    }

    const itemKey = `${sectionName}::${itemName}`;
    let item = itemIndex.get(itemKey);
    if (!item) {
      item = { name: itemName, position: section.items.length, comments: [] };
      section.items.push(item);
      itemIndex.set(itemKey, item);
    }

    const commentKey = `${itemKey}::${commentName}`;
    const priorCount = commentKeyCounts.get(commentKey) ?? 0;
    commentKeyCounts.set(commentKey, priorCount + 1);
    if (priorCount > 0) {
      warnings.push({
        level: "warning",
        message: `Duplicate comment name "${commentName}" within item "${itemName}" (section "${sectionName}"). Both rows were kept as separate comments rather than merged.`,
        rowNumber,
        section: sectionName,
        item: itemName,
        comment: commentName,
      });
    }

    const rawText = cellToString(get(row, "commentText"));
    let textHtml: string | null = null;
    if (rawText !== null) {
      const { clean, strippedTags } = sanitizeComment(rawText);
      textHtml = clean;
      if (strippedTags.length > 0) {
        warnings.push({
          level: "warning",
          message: `Comment "${commentName}" contained unsupported HTML (${strippedTags.join(
            ", "
          )}) that was removed for safety.`,
          rowNumber,
          section: sectionName,
          item: itemName,
          comment: commentName,
        });
      }
    }

    const severityRaw = get(row, "category");
    const severity = cellToNumber(severityRaw);
    if (severityRaw !== undefined && cellToString(severityRaw) !== null && severity === null) {
      warnings.push({
        level: "warning",
        message: `Comment "${commentName}" has a non-numeric Category value ("${severityRaw}") that could not be interpreted as severity.`,
        rowNumber,
        section: sectionName,
        item: itemName,
        comment: commentName,
      });
    }

    const sourceMetadata: Record<string, unknown> = {};
    const metadataKeys: CanonicalColumnKey[] = [
      "defaultValue2",
      "defaultUnitType",
      "defaultLocation",
      "defaultEstimateMin",
      "defaultEstimateMax",
      "locked",
      "simpleFormat",
      "disablePhotos",
      "uses",
      "lastModified",
    ];
    for (const key of metadataKeys) {
      const v = cellToString(get(row, key));
      if (v !== null) sourceMetadata[key] = v;
    }

    // An empty photo slot is skipped without comment; an unsafe URL scheme
    // is rejected and reported rather than stored.
    const photos: ParsedPhoto[] = [];
    for (const slot of PHOTO_SLOTS) {
      const { url, unsafe } = sanitizePhotoUrl(get(row, photoUrlColumnKey(slot)));
      if (unsafe) {
        warnings.push({
          level: "warning",
          message: `Comment "${commentName}" has a Default Photo ${slot} value with an unsupported URL scheme; it was not imported.`,
          rowNumber,
          section: sectionName,
          item: itemName,
          comment: commentName,
        });
        continue;
      }
      if (url === null) continue;
      photos.push({ slot, url, caption: cellToString(get(row, photoCaptionColumnKey(slot))) });
    }
    if (photos.length > 0) sourceMetadata.photos = photos;

    const orderRaw = cellToNumber(get(row, "order"));

    const comment: ParsedComment = {
      name: commentName,
      textHtml,
      commentType: cellToString(get(row, "commentType")),
      severity,
      answerType: cellToString(get(row, "answerType")),
      multipleChoiceOptions: splitList(get(row, "multipleChoiceOptions")),
      unitTypeOptions: splitList(get(row, "unitTypeOptions")),
      recommendation: cellToString(get(row, "recommendation")),
      defaultValue: cellToString(get(row, "defaultValue")),
      // Source row order, not the export's own "Order" column, is the sort
      // key - that column restarts per group and has gaps in real data.
      position: item.comments.length,
      sourceMetadata: { ...sourceMetadata, orderWithinItem: orderRaw },
      sourceRowNumber: rowNumber,
    };
    item.comments.push(comment);
    commentsCount++;
  });

  const itemsCount = sections.reduce((sum, s) => sum + s.items.length, 0);

  return {
    sections,
    stats: {
      sectionsCount: sections.length,
      itemsCount,
      commentsCount,
      rowsRead,
    },
    warnings,
  };
}
