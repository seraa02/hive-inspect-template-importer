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

  describe("template deletion", () => {
    // "Cancel" is a client-side confirmation dialog (DeleteTemplateButton)
    // that simply never calls the delete Server Action - there is nothing
    // to assert here at the repo layer beyond "the action was never
    // invoked," which is exercised by browser testing, not a DB test.

    it("deletes an existing template and its sections/items/comments; it is no longer retrievable", async () => {
      const { commitImport, deleteTemplate, getTemplateDetail } = await import("../repo");
      const { db } = await import("../client");
      const { sections, items, comments } = await import("../schema");
      const { eq } = await import("drizzle-orm");

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
                    answerType: null,
                    multipleChoiceOptions: null,
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

      const { templateId: id } = await commitImport({
        templateName: `Delete Test ${randomUUID()}`,
        filename: "test.xlsx",
        parsed,
      });

      const before = await getTemplateDetail(id);
      const sectionId = before!.sections[0].id;
      const itemId = before!.sections[0].items[0].id;
      const commentId = before!.sections[0].items[0].comments[0].id;

      await deleteTemplate(id);

      expect(await getTemplateDetail(id)).toBeUndefined();
      expect(await db.select().from(sections).where(eq(sections.id, sectionId))).toHaveLength(0);
      expect(await db.select().from(items).where(eq(items.id, itemId))).toHaveLength(0);
      expect(await db.select().from(comments).where(eq(comments.id, commentId))).toHaveLength(0);
    });

    it("deleting a template that no longer exists is a safe no-op, not an error", async () => {
      const { deleteTemplate } = await import("../repo");
      await expect(deleteTemplate(randomUUID())).resolves.not.toThrow();
    });
  });

  describe("createSection (Add section)", () => {
    let addSectionTemplateId: string;
    let addSectionCopyId: string;

    afterAll(async () => {
      const { deleteTemplate } = await import("../repo");
      if (addSectionTemplateId) await deleteTemplate(addSectionTemplateId);
      if (addSectionCopyId) await deleteTemplate(addSectionCopyId);
    });

    it("appends a new section at the end, and it survives a fresh read", async () => {
      const { commitImport, createSection, getTemplateDetail } = await import("../repo");

      const parsed = {
        sections: [
          { name: "Roof", position: 0, items: [] },
          { name: "Exterior", position: 1, items: [] },
        ],
        stats: { sectionsCount: 2, itemsCount: 0, commentsCount: 0, rowsRead: 0 },
        warnings: [],
      };
      const { templateId: id } = await commitImport({
        templateName: `Add Section Test ${randomUUID()}`,
        filename: "test.xlsx",
        parsed,
      });
      addSectionTemplateId = id;

      const { id: newSectionId } = await createSection(id, "Pool & Spa");

      const detail = await getTemplateDetail(id);
      expect(detail?.sections).toHaveLength(3);
      const newSection = detail!.sections.find((s) => s.id === newSectionId);
      expect(newSection?.name).toBe("Pool & Spa");
      expect(newSection?.position).toBe(2); // appended after the 2 imported sections
      expect(newSection?.items).toEqual([]);
    });

    it("rejects an empty or whitespace-only name without creating a section", async () => {
      const { createSection, getTemplateDetail } = await import("../repo");

      await expect(createSection(addSectionTemplateId, "   ")).rejects.toThrow(
        "Section name cannot be empty."
      );

      const detail = await getTemplateDetail(addSectionTemplateId);
      expect(detail?.sections).toHaveLength(3); // unchanged from the previous test
    });

    it("a manually-added section is included when the template is duplicated, and stays independent of the original", async () => {
      const { duplicateTemplate, getTemplateDetail, updateSectionName } = await import("../repo");

      const { templateId: copyId } = await duplicateTemplate(addSectionTemplateId, "Copy for add-section test");
      addSectionCopyId = copyId;

      const copy = await getTemplateDetail(copyId);
      const copiedSection = copy!.sections.find((s) => s.name === "Pool & Spa");
      expect(copiedSection).toBeDefined();

      await updateSectionName(copiedSection!.id, "Pool & Spa (renamed on copy)");

      const originalAfter = await getTemplateDetail(addSectionTemplateId);
      const copyAfter = await getTemplateDetail(addSectionCopyId);

      expect(originalAfter?.sections.find((s) => s.id === copiedSection!.id)).toBeUndefined();
      expect(originalAfter?.sections.some((s) => s.name === "Pool & Spa")).toBe(true);
      expect(copyAfter?.sections.some((s) => s.name === "Pool & Spa (renamed on copy)")).toBe(true);
    });
  });

  describe("createItem (Add item)", () => {
    let addItemTemplateId: string;
    let addItemCopyId: string;

    afterAll(async () => {
      const { deleteTemplate } = await import("../repo");
      if (addItemTemplateId) await deleteTemplate(addItemTemplateId);
      if (addItemCopyId) await deleteTemplate(addItemCopyId);
    });

    it("appends a new item at the end of a section, and it survives a fresh read", async () => {
      const { commitImport, createItem, getTemplateDetail } = await import("../repo");

      const parsed = {
        sections: [
          {
            name: "Heating",
            position: 0,
            items: [
              { name: "Furnace", position: 0, comments: [] },
              { name: "Ductwork", position: 1, comments: [] },
            ],
          },
        ],
        stats: { sectionsCount: 1, itemsCount: 2, commentsCount: 0, rowsRead: 0 },
        warnings: [],
      };
      const { templateId: id } = await commitImport({
        templateName: `Add Item Test ${randomUUID()}`,
        filename: "test.xlsx",
        parsed,
      });
      addItemTemplateId = id;

      const before = await getTemplateDetail(id);
      const sectionId = before!.sections[0].id;

      const { id: newItemId } = await createItem(sectionId, "Boiler");

      const detail = await getTemplateDetail(id);
      const items = detail!.sections[0].items;
      expect(items).toHaveLength(3);
      const newItem = items.find((i) => i.id === newItemId);
      expect(newItem?.name).toBe("Boiler");
      expect(newItem?.position).toBe(2); // appended after the 2 imported items
      expect(newItem?.comments).toEqual([]);
    });

    it("rejects an empty or whitespace-only name without creating an item", async () => {
      const { createItem, getTemplateDetail } = await import("../repo");

      const before = await getTemplateDetail(addItemTemplateId);
      const sectionId = before!.sections[0].id;

      await expect(createItem(sectionId, "   ")).rejects.toThrow("Item name cannot be empty.");

      const after = await getTemplateDetail(addItemTemplateId);
      expect(after!.sections[0].items).toHaveLength(3); // unchanged
    });

    it("a manually-added item is included when the template is duplicated, and stays independent of the original", async () => {
      const { duplicateTemplate, getTemplateDetail, updateItemName } = await import("../repo");

      const { templateId: copyId } = await duplicateTemplate(addItemTemplateId, "Copy for add-item test");
      addItemCopyId = copyId;

      const copy = await getTemplateDetail(copyId);
      const copiedItem = copy!.sections[0].items.find((i) => i.name === "Boiler");
      expect(copiedItem).toBeDefined();

      await updateItemName(copiedItem!.id, "Boiler (renamed on copy)");

      const originalAfter = await getTemplateDetail(addItemTemplateId);
      const copyAfter = await getTemplateDetail(addItemCopyId);

      expect(originalAfter!.sections[0].items.find((i) => i.id === copiedItem!.id)).toBeUndefined();
      expect(originalAfter!.sections[0].items.some((i) => i.name === "Boiler")).toBe(true);
      expect(copyAfter!.sections[0].items.some((i) => i.name === "Boiler (renamed on copy)")).toBe(true);
    });
  });

  describe("createComment (Add comment)", () => {
    let addCommentTemplateId: string;
    let addCommentCopyId: string;

    afterAll(async () => {
      const { deleteTemplate } = await import("../repo");
      if (addCommentTemplateId) await deleteTemplate(addCommentTemplateId);
      if (addCommentCopyId) await deleteTemplate(addCommentCopyId);
    });

    it("appends a new comment at the end of an item, with every other field null, and it survives a fresh read", async () => {
      const { commitImport, createComment, getTemplateDetail } = await import("../repo");

      const parsed = {
        sections: [
          {
            name: "Plumbing",
            position: 0,
            items: [
              {
                name: "Water Heater",
                position: 0,
                comments: [
                  {
                    name: "Age",
                    textHtml: "<p>10 years old.</p>",
                    commentType: "info",
                    severity: null,
                    answerType: null,
                    multipleChoiceOptions: null,
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
      const { templateId: id } = await commitImport({
        templateName: `Add Comment Test ${randomUUID()}`,
        filename: "test.xlsx",
        parsed,
      });
      addCommentTemplateId = id;

      const before = await getTemplateDetail(id);
      const itemId = before!.sections[0].items[0].id;

      const { id: newCommentId } = await createComment(itemId, "Leaking");

      const detail = await getTemplateDetail(id);
      const comments = detail!.sections[0].items[0].comments;
      expect(comments).toHaveLength(2);
      const newComment = comments.find((c) => c.id === newCommentId);
      expect(newComment?.name).toBe("Leaking");
      expect(newComment?.position).toBe(1); // appended after the 1 imported comment
      expect(newComment?.textHtml).toBeNull();
      expect(newComment?.commentType).toBeNull();
      expect(newComment?.severity).toBeNull();
      expect(newComment?.answerType).toBeNull();
      expect(newComment?.multipleChoiceOptions).toBeNull();
      expect(newComment?.sourceMetadata).toBeNull();
    });

    it("rejects an empty or whitespace-only name without creating a comment", async () => {
      const { createComment, getTemplateDetail } = await import("../repo");

      const before = await getTemplateDetail(addCommentTemplateId);
      const itemId = before!.sections[0].items[0].id;

      await expect(createComment(itemId, "   ")).rejects.toThrow("Comment name cannot be empty.");

      const after = await getTemplateDetail(addCommentTemplateId);
      expect(after!.sections[0].items[0].comments).toHaveLength(2); // unchanged
    });

    it("a manually-added comment is included when the template is duplicated, and stays independent of the original", async () => {
      const { duplicateTemplate, getTemplateDetail, updateCommentFields } = await import("../repo");

      const { templateId: copyId } = await duplicateTemplate(addCommentTemplateId, "Copy for add-comment test");
      addCommentCopyId = copyId;

      const copy = await getTemplateDetail(copyId);
      const copiedComment = copy!.sections[0].items[0].comments.find((c) => c.name === "Leaking");
      expect(copiedComment).toBeDefined();

      await updateCommentFields(copiedComment!.id, { textHtml: "<p>Added on the copy only.</p>" });

      const originalAfter = await getTemplateDetail(addCommentTemplateId);
      const copyAfter = await getTemplateDetail(addCommentCopyId);

      const originalLeaking = originalAfter!.sections[0].items[0].comments.find((c) => c.name === "Leaking");
      const copyLeaking = copyAfter!.sections[0].items[0].comments.find((c) => c.name === "Leaking");

      expect(originalLeaking?.textHtml).toBeNull();
      expect(copyLeaking?.textHtml).toBe("<p>Added on the copy only.</p>");
    });
  });
});
