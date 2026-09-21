import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// templates -> sections -> items -> comments (leaf answer fields).
// `position` stores explicit ordering so it survives duplication and edits.
// `sourceMetadata` on comments holds low-signal export columns (Locked,
// Simple Format, Default Location, photo URLs, etc.) that don't warrant a
// dedicated column, so nothing from the source row is silently discarded.

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
  textHtml: text("text_html"),
  // Not a fixed enum - preserved verbatim since another export may use different values.
  commentType: text("comment_type"),
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

// One row per import attempt, keeping warnings/stats visible after the fact.
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
