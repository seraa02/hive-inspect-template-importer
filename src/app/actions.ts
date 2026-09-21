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

// Validates and parses only - nothing is written until the user confirms.
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

// Re-parses the file server-side rather than trusting client-supplied JSON,
// then persists inside one transaction.
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

// Permanent delete. Deleting an already-gone template is a safe no-op.
export async function deleteTemplateAction(templateId: string) {
  await deleteTemplate(templateId);
  revalidatePath("/");
  redirect("/");
}

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
