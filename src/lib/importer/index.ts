import { mapRowsToTemplate } from "./mapRows";
import { readWorkbookRows, validateUpload } from "./workbook";

export { ImportValidationError } from "./errors";
export { mapRowsToTemplate } from "./mapRows";
export * from "./types";

// Full pipeline: validate -> read workbook -> parse/normalize/map.
export async function importSpectoraExport(buffer: Buffer, filename: string) {
  validateUpload(filename, buffer.byteLength);
  const { headerRow, dataRows } = await readWorkbookRows(buffer);
  return mapRowsToTemplate(headerRow, dataRows);
}
