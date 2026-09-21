import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Data model
 * ----------
 * templates -> sections -> items -> comments (leaf answer fields)
 *
 * This mirrors the hierarchy actually present in the Spectora HTML-text
 * export (Section Name / Item Name / Comment Name columns), and lines up
 * with how Hive Inspect itself groups template content into named areas.
 *
 * `position` columns store explicit ordering (source row order) rather
 * than relying on primary-key/insertion order, so ordering survives
 * duplication, edits, and re-reads.
 *
 * `sourceMetadata` on comments holds low-signal columns from the export
 * (Locked, Simple Format, Disable Photos, Uses, Default Location, Default
 * Value 2, Default Unit Type, Last Modified) so nothing from the source
 * row is silently discarded, without spending mostly-empty columns on
 * fields the committed fixture never uses.
 *
 * `sourceMetadata.photos` (when present) is an array of
 * `{ slot, url, caption }` built from the export's Default Photo 1-10 (+
 * caption) columns - see src/lib/importer/mapRows.ts. Empty photo slots are
 * omitted rather than stored as empty; URLs are restricted to http/https
 * (see sanitizePhotoUrl in mapRows.ts).
 */

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  sourceFormat: text("source_format").notNull().default("spectora_html_text_export"),
  sourceFilename: text("source_filename"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sections = pgTable("sections", {
  id: uuid("id").primaryKey(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => templates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items = pgTable("items", {
  id: uuid("id").primaryKey(),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => sections.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Sanitized HTML fragment. Plain text is valid HTML too.
  textHtml: text("text_html"),
  // Raw values from "Comment Type (info, limit, defect)" - preserved verbatim,
  // not forced into a fixed enum, since another export may use other values.
  commentType: text("comment_type"),
  // Raw value from "Category (-1: Low, 0: Med, 1: High)"
  severity: integer("severity"),
  answerType: text("answer_type"),
  multipleChoiceOptions: jsonb("multiple_choice_options").$type<string[] | null>(),
  unitTypeOptions: jsonb("unit_type_options").$type<string[] | null>(),
  recommendation: text("recommendation"),
  defaultValue: text("default_value"),
  position: integer("position").notNull(),
  sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per import attempt. Keeps warnings/stats visible after the fact,
// even after the user navigates away and comes back.
export const imports = pgTable("imports", {
  id: uuid("id").primaryKey(),
  templateId: uuid("template_id").references(() => templates.id, { onDelete: "cascade" }),
  filename: text("filename"),
  status: text("status").notNull(), // 'committed' | 'failed'
  sectionsCount: integer("sections_count").notNull().default(0),
  itemsCount: integer("items_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  warnings: jsonb("warnings").$type<ImportWarning[]>().notNull().default([]),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImportWarning = {
  level: "warning" | "error";
  message: string;
  rowNumber?: number;
  section?: string;
  item?: string;
  comment?: string;
};

export const templatesRelations = relations(templates, ({ many }) => ({
  sections: many(sections),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  template: one(templates, { fields: [sections.templateId], references: [templates.id] }),
  items: many(items),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  section: one(sections, { fields: [items.sectionId], references: [sections.id] }),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  item: one(items, { fields: [comments.itemId], references: [items.id] }),
}));
