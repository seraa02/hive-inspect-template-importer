"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { importSpectoraExport, ImportValidationError } from "@/lib/importer";
import {
  commitImport,
  createComment,
  createItem,
  createSection,
  deleteTemplate,
  duplicateTemplate,
  recordFailedImport,
  updateCommentFields,
  updateItemName,
  updateSectionName,
} from "@/db/repo";
import type { ParsedTemplate } from "@/lib/importer/types";

export interface PreviewResult {
  ok: true;
  filename: string;
  suggestedName: string;
  stats: ParsedTemplate["stats"];
  warnings: ParsedTemplate["warnings"];
  sectionNames: string[];
}

export interface PreviewFailure {
  ok: false;
  filename: string;
  errorMessage: string;
}

/**
 * Step 1 of the import pipeline exposed to the UI: validate + parse only.
 * Nothing is written to the database yet - the caller shows this preview
 * (counts + warnings) and asks the user to confirm before we commit.
 */
export async function previewImportAction(formData: FormData): Promise<PreviewResult | PreviewFailure> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, filename: "unknown", errorMessage: "No file was uploaded." };
  }

  const filename = file.name;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await importSpectoraExport(buffer, filename);
    return {
      ok: true,
      filename,
      suggestedName: filename.replace(/\.(xlsx|xls)$/i, "").trim() || "Imported Template",
      stats: parsed.stats,
      warnings: parsed.warnings,
      sectionNames: parsed.sections.map((s) => s.name),
    };
  } catch (err) {
    await recordFailedImport({
      filename,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof ImportValidationError) {
      return { ok: false, filename, errorMessage: err.message };
    }
    return {
      ok: false,
      filename,
      errorMessage: "An unexpected error occurred while reading this file. It was not imported.",
    };
  }
}

/**
 * Step 2: re-parse (parsing is deterministic and cheap) and persist inside
 * one transaction. Re-parsing rather than trusting client-supplied JSON
 * means the server never has to trust anything about the file's contents
 * beyond what it validates itself.
 */
export async function commitImportAction(formData: FormData) {
  const file = formData.get("file");
  const templateName = String(formData.get("templateName") ?? "").trim();
  if (!(file instanceof File)) {
    throw new Error("No file was uploaded.");
  }
  if (!templateName) {
    throw new Error("Template name is required.");
  }

  const filename = file.name;
  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await importSpectoraExport(buffer, filename);
  } catch (err) {
    await recordFailedImport({
      filename,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const { templateId } = await commitImport({ templateName, filename, parsed });
  revalidatePath("/");
  redirect(`/templates/${templateId}`);
}

export async function duplicateTemplateAction(templateId: string) {
  const { templateId: newId } = await duplicateTemplate(templateId);
  revalidatePath("/");
  redirect(`/templates/${newId}`);
}

/**
 * Permanent delete, confirmed client-side before this is ever called (see
 * DeleteTemplateButton). deleteTemplate() deletes 0 rows (a safe no-op,
 * not an error) if the template was already gone - e.g. a second tab
 * confirming a delete that already happened - so this is safe to call
 * more than once for the same id. Always redirects to the template list,
 * which is a harmless refresh if already there.
 */
export async function deleteTemplateAction(templateId: string) {
  await deleteTemplate(templateId);
  revalidatePath("/");
  redirect("/");
}

/**
 * Add section / Add item / Add comment mirror exactly the three levels
 * the importer itself builds (template -> sections -> items -> comments -
 * there is no separate "subsection" anywhere in this data model). Each is
 * a thin wrapper: create the row, then revalidate so it shows up in the
 * tree immediately. No reordering, no bulk creation - see NOTES.md
 * ("Editor extension: Add section / item / comment").
 */
export async function createSectionAction(templateId: string, name: string) {
  await createSection(templateId, name);
  revalidatePath(`/templates/${templateId}`);
}

export async function createItemAction(templateId: string, sectionId: string, name: string) {
  await createItem(sectionId, name);
  revalidatePath(`/templates/${templateId}`);
}

export async function createCommentAction(templateId: string, itemId: string, name: string) {
  await createComment(itemId, name);
  revalidatePath(`/templates/${templateId}`);
}

export async function updateSectionNameAction(templateId: string, sectionId: string, name: string) {
  await updateSectionName(sectionId, name);
  revalidatePath(`/templates/${templateId}`);
}

export async function updateItemNameAction(templateId: string, itemId: string, name: string) {
  await updateItemName(itemId, name);
  revalidatePath(`/templates/${templateId}`);
}

export async function updateCommentAction(
  templateId: string,
  commentId: string,
  fields: { name?: string; textHtml?: string }
) {
  await updateCommentFields(commentId, fields);
  revalidatePath(`/templates/${templateId}`);
}
