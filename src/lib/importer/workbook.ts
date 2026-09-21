import ExcelJS from "exceljs";
import { ImportValidationError } from "./errors";
import type { RawCell, RawRow } from "./mapRows";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB - generous for a template export, small enough to reject abuse

const ALLOWED_EXTENSIONS = [".xls", ".xlsx"];

export function validateUpload(filename: string, sizeBytes: number): void {
  if (sizeBytes === 0) {
    throw new ImportValidationError("The uploaded file is empty.");
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new ImportValidationError(
      `File is too large (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is ${
        MAX_UPLOAD_BYTES / 1024 / 1024
      } MB.`
    );
  }
  const lower = filename.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new ImportValidationError(
      `Unsupported file type. Please upload the .xls or .xlsx file produced by Spectora's "Export to spreadsheet -> Export HTML Text".`
    );
  }
}

function excelValueToCell(value: ExcelJS.CellValue): RawCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    // Rich text, hyperlink, formula-result, or date objects.
    if ("richText" in value && Array.isArray((value as { richText: { text: string }[] }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    }
    if ("text" in value) return String((value as { text: unknown }).text);
    if ("result" in value) return excelValueToCell((value as { result: ExcelJS.CellValue }).result);
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
  return value as RawCell;
}

export interface WorkbookRows {
  headerRow: RawRow;
  dataRows: RawRow[];
}

// Reads the first worksheet into plain arrays - no business logic, and no
// assumption about the sheet's name.
export async function readWorkbookRows(buffer: Buffer): Promise<WorkbookRows> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (err) {
    throw new ImportValidationError(
      `Could not read this file as an Excel workbook. It may be corrupted or in an unsupported format. (${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new ImportValidationError("The workbook does not contain any worksheets.");
  }

  const allRows: RawRow[] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const maxCol = Math.max(row.cellCount, worksheet.columnCount);
    const values: RawCell[] = [];
    for (let c = 1; c <= maxCol; c++) {
      values.push(excelValueToCell(row.getCell(c).value));
    }
    allRows.push(values);
  });

  if (allRows.length === 0) {
    throw new ImportValidationError("The worksheet is empty - no header row was found.");
  }

  const [headerRow, ...dataRows] = allRows;
  return { headerRow, dataRows };
}
