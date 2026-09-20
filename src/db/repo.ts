import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { comments, imports, items, sections, templates, type ImportWarning } from "./schema";
import type { ParsedTemplate } from "@/lib/importer/types";
import { sanitizeComment } from "@/lib/importer/sanitizeComment";

/**
 * Persists a fully-parsed template (sections/items/comments already
 * validated and normalized by the importer) inside a single database
 * transaction, along with an `imports` record capturing the warnings and
 * counts produced during parsing. If anything fails partway through, the
 * whole transaction rolls back - the database is never left with a
 * half-imported template.
 */
export async function commitImport(params: {
  templateName: string;
  filename: string;
  parsed: ParsedTemplate;
}) {
  const { templateName, filename, parsed } = params;

  return db.transaction(async (tx) => {
    const templateId = randomUUID();
    await tx.insert(templates).values({
      id: templateId,
      name: templateName,
      sourceFormat: "spectora_html_text_export",
      sourceFilename: filename,
    });

    for (const section of parsed.sections) {
      const sectionId = randomUUID();
      await tx.insert(sections).values({
        id: sectionId,
        templateId,
        name: section.name,
        position: section.position,
      });

      for (const item of section.items) {
        const itemId = randomUUID();
        await tx.insert(items).values({
          id: itemId,
          sectionId,
          name: item.name,
          position: item.position,
        });

        if (item.comments.length > 0) {
          await tx.insert(comments).values(
            item.comments.map((c) => ({
              id: randomUUID(),
              itemId,
              name: c.name,
              textHtml: c.textHtml,
              commentType: c.commentType,
              severity: c.severity,
              answerType: c.answerType,
              multipleChoiceOptions: c.multipleChoiceOptions,
              unitTypeOptions: c.unitTypeOptions,
              recommendation: c.recommendation,
              defaultValue: c.defaultValue,
              position: c.position,
              sourceMetadata: c.sourceMetadata,
            }))
          );
        }
      }
    }

    const importId = randomUUID();
    await tx.insert(imports).values({
      id: importId,
      templateId,
      filename,
      status: "committed",
      sectionsCount: parsed.stats.sectionsCount,
      itemsCount: parsed.stats.itemsCount,
      commentsCount: parsed.stats.commentsCount,
      warnings: parsed.warnings as ImportWarning[],
    });

    return { templateId, importId };
  });
}

/** Records a failed import attempt (no template rows are created). */
export async function recordFailedImport(params: { filename: string; errorMessage: string }) {
  const importId = randomUUID();
  await db.insert(imports).values({
    id: importId,
    templateId: null,
    filename: params.filename,
    status: "failed",
    warnings: [],
    errorMessage: params.errorMessage,
  });
  return { importId };
}

export async function listTemplates() {
  return db.query.templates.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function getTemplateDetail(templateId: string) {
  return db.query.templates.findFirst({
    where: eq(templates.id, templateId),
    with: {
      sections: {
        orderBy: (s, { asc }) => [asc(s.position)],
        with: {
          items: {
            orderBy: (i, { asc }) => [asc(i.position)],
            with: {
              comments: {
                orderBy: (c, { asc }) => [asc(c.position)],
              },
            },
          },
        },
      },
    },
  });
}

export async function getImportForTemplate(templateId: string) {
  return db.query.imports.findFirst({
    where: eq(imports.templateId, templateId),
    orderBy: (i, { desc }) => [desc(i.createdAt)],
  });
}

export async function updateSectionName(sectionId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Section name cannot be empty.");
  await db.update(sections).set({ name: trimmed, updatedAt: new Date() }).where(eq(sections.id, sectionId));
}

export async function updateItemName(itemId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Item name cannot be empty.");
  await db.update(items).set({ name: trimmed, updatedAt: new Date() }).where(eq(items.id, itemId));
}

export async function updateCommentFields(
  commentId: string,
  fields: { name?: string; textHtml?: string }
) {
  const update: Partial<typeof comments.$inferInsert> = { updatedAt: new Date() };
  if (fields.name !== undefined) {
    const trimmed = fields.name.trim();
    if (!trimmed) throw new Error("Comment name cannot be empty.");
    update.name = trimmed;
  }
  if (fields.textHtml !== undefined) {
    // Re-sanitize on every save - edits go through the same allowlist as
    // import, so stored XSS cannot be introduced via the editor either.
    update.textHtml = sanitizeComment(fields.textHtml).clean;
  }
  await db.update(comments).set(update).where(eq(comments.id, commentId));
}

/**
 * Deep-copies a template (sections -> items -> comments) with entirely new
 * IDs, in one transaction. The result is fully independent: editing the
 * copy touches only the new rows and never the originals.
 */
export async function duplicateTemplate(templateId: string, newName?: string) {
  const original = await getTemplateDetail(templateId);
  if (!original) throw new Error("Template not found.");

  return db.transaction(async (tx) => {
    const newTemplateId = randomUUID();
    await tx.insert(templates).values({
      id: newTemplateId,
      name: newName?.trim() || `${original.name} (Copy)`,
      description: original.description,
      sourceFormat: original.sourceFormat,
      sourceFilename: original.sourceFilename,
    });

    for (const section of original.sections) {
      const newSectionId = randomUUID();
      await tx.insert(sections).values({
        id: newSectionId,
        templateId: newTemplateId,
        name: section.name,
        position: section.position,
      });

      for (const item of section.items) {
        const newItemId = randomUUID();
        await tx.insert(items).values({
          id: newItemId,
          sectionId: newSectionId,
          name: item.name,
          position: item.position,
        });

        if (item.comments.length > 0) {
          await tx.insert(comments).values(
            item.comments.map((c) => ({
              id: randomUUID(),
              itemId: newItemId,
              name: c.name,
              textHtml: c.textHtml,
              commentType: c.commentType,
              severity: c.severity,
              answerType: c.answerType,
              multipleChoiceOptions: c.multipleChoiceOptions,
              unitTypeOptions: c.unitTypeOptions,
              recommendation: c.recommendation,
              defaultValue: c.defaultValue,
              position: c.position,
              sourceMetadata: c.sourceMetadata,
            }))
          );
        }
      }
    }

    return { templateId: newTemplateId };
  });
}

export async function deleteTemplate(templateId: string) {
  await db.delete(templates).where(eq(templates.id, templateId));
}
