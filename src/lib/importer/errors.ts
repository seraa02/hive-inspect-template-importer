// Thrown when the uploaded file can't be turned into a template at all -
// wrong file type, corrupt workbook, or missing required columns.
export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}
