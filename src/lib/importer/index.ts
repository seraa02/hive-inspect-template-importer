import { mapRowsToTemplate } from "./mapRows";
import { readWorkbookRows, validateUpload } from "./workbook";

export { ImportValidationError } from "./errors";
export { mapRowsToTemplate } from "./mapRows";
export * from "./types";

/**
 * Full pipeline: validate -> read workbook -> parse/normalize/map ->
 * return a structured template + warnings. Throws ImportValidationError
 * for anything that makes the file unusable; never returns a partial
 * result silently - callers decide whether to persist or reject based on
 * the warnings list.
 */
export async function importSpectoraExport(buffer: Buffer, filename: string) {
  validateUpload(filename, buffer.byteLength);
  const { headerRow, dataRows } = await readWorkbookRows(buffer);
  return mapRowsToTemplate(headerRow, dataRows);
}
