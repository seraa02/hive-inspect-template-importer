import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

/**
 * Integration tests against a real Postgres database, covering the parts
 * of the assignment that a pure unit test cannot: persistence surviving a
 * fresh read, editing, duplication, and independence of the copy from the
 * original.
 *
 * These require DATABASE_URL (see README "Local setup"). They are skipped
 * automatically - not failed - when it is not set, so the deterministic
 * parser tests (`npm test`) always run standalone. Run these specifically
 * with `npm run test:db`.
 */
describe.skipIf(!process.env.DATABASE_URL)("repo (integration)", () => {
  let templateId: string;
  let copyId: string;

  afterAll(async () => {
    const { deleteTemplate } = await import("../repo");
    if (templateId) await deleteTemplate(templateId);
    if (copyId) await deleteTemplate(copyId);
  });

  it("commits an import transactionally and it survives a fresh read", async () => {
    const { commitImport, getTemplateDetail } = await import("../repo");

    const parsed = {
      sections: [
        {
          name: "Roof",
          position: 0,
          items: [
            {
              name: "Coverings",
              position: 0,
              comments: [
                {
                  name: "Material",
                  textHtml: "<p>Asphalt shingle.</p>",
                  commentType: "info",
                  severity: null,
                  answerType: "checkbox",
                  multipleChoiceOptions: ["Asphalt", "Metal"],
                  unitTypeOptions: null,
                  recommendation: null,
                  defaultValue: null,
                  position: 0,
                  sourceMetadata: null,
                  sourceRowNumber: 2,
                },
              ],
            },
          ],
        },
      ],
      stats: { sectionsCount: 1, itemsCount: 1, commentsCount: 1, rowsRead: 1 },
      warnings: [],
    };

    const result = await commitImport({
      templateName: `Integration Test ${randomUUID()}`,
      filename: "test.xlsx",
      parsed,
    });
    templateId = result.templateId;

    // Fresh read - a completely separate query, not just returning what we
    // just inserted - proves this is real persistence, not an in-memory echo.
    const detail = await getTemplateDetail(templateId);
    expect(detail?.sections).toHaveLength(1);
    expect(detail?.sections[0].items[0].comments[0].name).toBe("Material");
    expect(detail?.sections[0].items[0].comments[0].multipleChoiceOptions).toEqual([
      "Asphalt",
      "Metal",
    ]);
  });

  it("persists edits to section, item, and comment text", async () => {
    const { getTemplateDetail, updateSectionName, updateItemName, updateCommentFields } =
      await import("../repo");

    const detail = await getTemplateDetail(templateId);
    const section = detail!.sections[0];
    const item = section.items[0];
    const comment = item.comments[0];

    await updateSectionName(section.id, "Roof - Edited");
    await updateItemName(item.id, "Coverings - Edited");
    await updateCommentFields(comment.id, { textHtml: "<p>Updated text.</p>" });

    const reread = await getTemplateDetail(templateId);
    expect(reread?.sections[0].name).toBe("Roof - Edited");
    expect(reread?.sections[0].items[0].name).toBe("Coverings - Edited");
    expect(reread?.sections[0].items[0].comments[0].textHtml).toBe("<p>Updated text.</p>");
  });

  it("duplicates a template with new independent IDs, and editing the copy leaves the original untouched", async () => {
    const { duplicateTemplate, getTemplateDetail, updateCommentFields } = await import("../repo");

    const original = await getTemplateDetail(templateId);
    const originalCommentText = original!.sections[0].items[0].comments[0].textHtml;

    const { templateId: newTemplateId } = await duplicateTemplate(templateId, "Copy for test");
    copyId = newTemplateId;
    expect(newTemplateId).not.toBe(templateId);

    const copy = await getTemplateDetail(newTemplateId);
    expect(copy?.sections[0].id).not.toBe(original!.sections[0].id);
    expect(copy?.sections[0].items[0].id).not.toBe(original!.sections[0].items[0].id);
    expect(copy?.sections[0].items[0].comments[0].id).not.toBe(
      original!.sections[0].items[0].comments[0].id
    );
    expect(copy?.sections[0].items[0].comments[0].textHtml).toBe(originalCommentText);

    // Edit the copy only.
    await updateCommentFields(copy!.sections[0].items[0].comments[0].id, {
      textHtml: "<p>Changed on the copy only.</p>",
    });

    const originalAfter = await getTemplateDetail(templateId);
    const copyAfter = await getTemplateDetail(newTemplateId);

    expect(originalAfter?.sections[0].items[0].comments[0].textHtml).toBe(originalCommentText);
    expect(copyAfter?.sections[0].items[0].comments[0].textHtml).toBe(
      "<p>Changed on the copy only.</p>"
    );
  });

  it("rolls back the whole import on failure, leaving no partial template", async () => {
    const { commitImport } = await import("../repo");
    const { db } = await import("../client");
    const { templates } = await import("../schema");
    const { eq } = await import("drizzle-orm");

    const badParsed = {
      sections: [
        {
          name: "Broken Section",
          position: 0,
          items: [
            {
              name: "Item",
              position: 0,
              // deliberately malformed (name: null violates the NOT NULL
              // constraint) to force a DB error mid-transaction
              comments: [{ name: null, position: 0 }],
            },
          ],
        },
      ],
      stats: { sectionsCount: 1, itemsCount: 1, commentsCount: 1, rowsRead: 1 },
      warnings: [],
    };

    const templateName = `Should Not Persist ${randomUUID()}`;
    await expect(
      commitImport({ templateName, filename: "bad.xlsx", parsed: badParsed as never })
    ).rejects.toThrow();

    const rows = await db.select().from(templates).where(eq(templates.name, templateName));
    expect(rows).toHaveLength(0);
  });
});
