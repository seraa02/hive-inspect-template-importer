/**
 * Thrown when the uploaded file cannot be turned into a template at all
 * (wrong file type, corrupt workbook, no recognizable header row, or the
 * three columns required to build any hierarchy - Section Name, Item Name,
 * Comment Name - are missing). This is the "failure case": the app must
 * catch this, show it to the user, and leave no partial data behind.
 */
export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}
