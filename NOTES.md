# NOTES

## What was built

- A generic parser for Spectora's "Export HTML Text" spreadsheet format
  (`src/lib/importer/`), driven entirely by column headers rather than
  positions, template names, or row counts - it works on the committed
  InterNACHI Residential export and should work on any other export in the
  same format.
- A structured, editable data model: `templates -> sections -> items ->
  comments`, each with an explicit `position` column for ordering. Comment
  HTML is stored as sanitized HTML in a text column, not folded into one
  opaque blob.
- A three-step import pipeline: validate -> parse -> **preview** (nothing
  written yet) -> commit (one DB transaction).
- An editor: section names, item names, and comment text are all editable
  and persist to Postgres. Other per-comment fields from the export (answer
  type, multiple-choice options, severity, recommendation) are shown
  read-only, preserved losslessly, not yet editable (see "What was cut").
- Template duplication: a full deep copy (new IDs throughout) in one
  transaction, verified independent of the original by an automated test.
- A failure case: uploading a corrupted file or a workbook missing the
  required columns produces a clear, specific error and writes nothing to
  the database (verified both manually and by a rolled-back-transaction
  test).
- Automated tests: 13 parser unit tests (no DB required) + 4 DB integration
  tests (persistence, editing, duplication/independence, transactional
  rollback).

## What was intentionally cut, and why

- **Editing answer type / multiple-choice options / severity /
  recommendation.** The assignment's baseline is section names, item names,
  and comment text. These other fields are imported and displayed (so
  nothing is hidden), but editing them would mean building type-specific
  input controls (option-list editors, severity pickers) for marginal value
  in a 2-day budget. Cut in favor of finishing the required baseline
  faithfully.
- **WYSIWYG rich-text editor for comment text.** Comment text is edited as
  its underlying sanitized HTML in a `<textarea>`, with a live rendered
  preview next to it. This is fully lossless (unlike, say, stripping tags to
  plain text) and simple to build and audit. A real WYSIWYG editor (e.g.
  TipTap) would be the natural next step for a non-technical inspector, but
  the export only has `<p>`, `<a>`, and one `<strong>`/`<div>` across all 392
  comments, so a plain-text-with-preview editor is a proportionate amount of
  UI investment for what the source data actually contains.
- **Binsr exploration.** Not explored, in favor of spending the available
  time on the core importer, editor, duplication, tests, and this
  documentation, which the assignment says to prioritize over the optional
  comparison.
- **Auth / multi-user.** Out of scope per the assignment (no login
  requirement stated); the app has no auth layer. This is a take-home demo,
  not a multi-tenant product.

## Supported input format

Single-sheet `.xls`/`.xlsx` workbook (Spectora's export is actually OOXML
despite the `.xls` extension) with a header row. Required columns: `Section
Name`, `Item Name`, `Comment Name`. Optional, recognized columns: `Comment
Text`, `Comment Type (info, limit, defect)`, `Category (-1: Low, 0: Med, 1:
High)`, `Multiple Choice Options`, `Unit Type Options`, `Recommendation`,
`Order (w/i item)`, `Answer Type`, `Default Value`, `Default Value 2`,
`Default Unit Type`, `Default Location`, `Default Estimate Min/Max`,
`Locked`, `Simple Format`, `Disable Photos`, `Uses`, `Default Photo 1-10 (+
captions)`, `Last Modified`. Column order does not matter (headers are
matched by normalized text, not position); an export with extra,
unrecognized columns still imports, with a warning naming the columns that
weren't mapped to a field.

## Actual structure found in the committed export

(InterNACHI Residential, exported 2026-09-19, 393 rows x 42 columns, single
sheet "Sheet1")

- 13 sections, 69 items, 392 comments (one row = one comment/leaf field).
- Hierarchy is implicit in row grouping - there is no explicit
  section-order or item-order column, only a per-comment `Order (w/i item)`.
  Item names repeat across sections (e.g. "General" appears in 8 different
  sections) - items are unique only within their section, not globally.
- `Order (w/i item)` is a reliable sort key **within (section, item,
  comment_type)** for 110 of 115 groups (0..n-1, no gaps); 5 groups have real
  gaps/duplicates. Because of that, the importer does not trust this column
  for the authoritative sort order - it uses source row order instead (see
  DECISIONS.md), and keeps the raw value in `sourceMetadata.orderWithinItem`
  for reference.
- One genuine duplicate: `Fireplace -> Damper Doors -> "Damper Inoperable"`
  appears twice with different comment text. The importer keeps both as
  separate comments and emits a warning rather than merging or dropping
  either - this is exercised by an automated test.
- `Comment Type` is `info` (78), `limit` (12), or `defect` (302) - this maps
  conceptually onto the Information / Limitations / Defects & Deficiencies
  categories observed in Hive's own template editor, though the importer
  does not force values into that exact vocabulary (another export could use
  different comment types).
- `Section Name` / `Item Name` contain literal HTML entities as plain text
  (e.g. the string `"Crawlspace &amp; Structure"`, not an actual `&`) in 107
  and 158 rows respectively - these are HTML-decoded on import so they
  display correctly. `Comment Name` never had entities in this export, but
  is decoded defensively too.
- All 20 "Default Photo 1-10 (+ captions)", `Locked`, `Simple Format`,
  `Disable Photos`, `Default Value 2`, `Default Unit Type`, and `Default
  Location` columns are present in the header but **100% empty** in every
  row of this export - genuinely absent from the source, not something the
  importer failed to read.

## Formatting, links, and rich content

- What exists in the source: `Comment Text` contains HTML - specifically
  `<p>` (244 occurrences), `<a href>` (43, all `http`/`https`, zero
  `javascript:`), one `<strong>`, and one `<div>`.
- What we preserve: `<p>`, `<a href>` (http/https/mailto only), `<strong>`,
  `<b>`, `<em>`, `<i>`, `<ul>`, `<ol>`, `<li>`, `<br>`, `<div>`. Preserved
  links get `rel="noopener noreferrer" target="_blank"` added.
- What we normalize: `<a href>` whose scheme is not http/https/mailto (e.g.
  `javascript:`) is downgraded to a plain `<span>` and reported as a
  warning; any other disallowed tag or attribute (e.g. `<script>`, `<img>`,
  inline `style=`, `class=`) is stripped, and its presence is reported as a
  warning naming the comment. Sanitization runs through the same allowlist
  on import and on every edit, so it is not possible to introduce stored
  XSS through the editor either.
- What the importer does not support: arbitrary HTML (tables, images,
  embedded video, custom styling). This was a deliberate allowlist
  decision, not a parsing failure - anything outside the allowlist is
  visibly flagged, never silently dropped.
- What is genuinely absent from the source export (not an importer
  limitation): one comment (`Doors, Windows & Interior > Walls > "Damaged"`
  category, row 311 in the fixture) contains `<div class="youtube-embed-
  wrapper" style="position:relative;padding-bottom:56.25%;...">` with no
  content inside it. This is the CSS wrapper Spectora uses for a responsive
  embedded video - the actual `<iframe>` (the YouTube embed itself) is not
  present in the "Export HTML Text" file at all. The export format strips
  embedded video before the file ever reaches this importer; there is
  nothing to recover here on the import side. This was the single most
  interesting finding while inspecting the real export, and is the "hardest
  import problem" referenced in the walkthrough.

## Missing-from-export vs. unsupported-by-importer

These are tracked as two different kinds of warnings on purpose:

- **Missing from the export**: the source file itself does not contain the
  information (e.g. the YouTube embed above, or the 20 always-empty photo/
  metadata columns). Nothing was lost by this importer - there was nothing
  to import.
- **Unsupported by the importer**: the source file *does* contain the
  information, but this importer's allowlist/mapping does not carry it
  through (e.g. a `javascript:` link, an inline `<script>` tag, or a column
  header this parser does not recognize). These always produce a warning
  that names the specific row/comment/column affected.

## How preservation was checked

- An automated test (`src/lib/importer/__tests__/fixture.test.ts`) runs the
  real committed export through the full import pipeline and asserts the
  resulting section/item/comment counts (13 / 69 / 392) and specific known
  cases (the duplicate comment, HTML-entity decoding) match what direct
  inspection of the source file found.
- An automated integration test (`src/db/__tests__/repo.test.ts`) commits an
  import, re-reads it from a fresh query (not the just-inserted objects),
  edits section/item/comment fields, re-reads again, duplicates the
  template, edits the copy, and asserts the original's data is byte-for-
  byte unchanged.
- Manually: imported the real fixture through the running app, opened the
  editor, confirmed the section/item counts and warning banner matched the
  preview, edited a comment, refreshed the browser, confirmed the edit
  survived, duplicated the template, edited the copy, confirmed the
  original was untouched in the database.

## Failure cases (demonstrated)

1. A corrupted/non-workbook file (wrong bytes, `.xls` extension) - the app
   shows "Could not read this file as an Excel workbook..." and records a
   failed `imports` row with no template created.
2. A well-formed workbook missing the required `Section Name` / `Item Name`
   / `Comment Name` columns - the app shows "This file is missing required
   column(s): section name, item name, comment name..." and again writes
   nothing.

Both are enforced server-side (not just client-side validation) and both
leave the database exactly as it was before the attempt - verified by an
automated test that intentionally trips a NOT NULL constraint mid-
transaction and asserts the transaction rolled back completely.

## Approximate time spent

Roughly one focused session: source-file inspection and format discovery,
scaffolding, importer + tests, persistence + editor + duplication, browser-
driven end-to-end verification, and this documentation.

## Existing libraries / starter code used

- Scaffolded with `create-next-app` (Next.js's own starter). No other
  starter templates or boilerplate repos were used.
- Runtime libraries: `next`, `react`, Drizzle ORM (`drizzle-orm`,
  `drizzle-kit`) + `postgres` for the database, `exceljs` for workbook
  parsing, `sanitize-html` for XSS-safe HTML, `he` for HTML entity decoding,
  Tailwind CSS v4 for styling, `vitest` for tests. All application logic
  (the parser, mapper, sanitizer, repo, server actions, UI) was written for
  this project.

## AI coding tools used

Built with Claude Code (Claude), used to: inspect the real Spectora export
programmatically (openpyxl-based analysis to discover the actual column
layout, hierarchy, ordering quirks, and rich-content edge cases before
writing any importer code), scaffold the Next.js app, write the parser/
mapper/sanitizer/repo/server actions/UI, write and run the automated tests,
and drive an end-to-end browser verification pass (upload -> preview ->
commit -> edit -> duplicate -> confirm independence -> trigger both failure
cases) against a real local Postgres database before writing this
documentation. Every claim in this file (counts, warning text, specific
row numbers) was produced by actually running the code against the real
committed export, not written from memory of what a Spectora export
"usually" looks like.

## Important architectural decisions

See DECISIONS.md for the full reasoning behind each one (deterministic
parsing over an LLM, header-driven column matching over positional columns,
source row order over the export's own `Order` column, storing structured
columns + a small `sourceMetadata` JSON catch-all instead of one opaque
blob, Server Actions instead of a separate REST layer, `exceljs` over
`xlsx`/SheetJS).

## Future scalability considerations

The schema deliberately stops at `templates -> sections -> items ->
comments` and does not try to anticipate every future entity, but it does
not block adding them later: a future `inspections` table could reference
`templates.id` (as the template a given inspection was built from) without
touching the existing tables, and `companies` / `inspectors` /
`properties` would sit alongside `templates` the same way. Nothing in the
current schema encodes "this app only ever has one company" or similar
assumptions that would need to be undone.

## What would be built next with more time

1. Editable multiple-choice options and answer type in the editor.
2. A real rich-text (WYSIWYG) editor for comment text, since the plain-
   textarea-plus-preview approach is honest but not ideal for a non-
   technical inspector.
3. Binsr exploration and comparison, as encouraged (not required) by the
   assignment.
4. Bulk operations (reorder sections/items via drag-and-drop; the
   `position` columns already support this, only the UI is missing).

## Hive product feedback

Based on the exploration notes provided for this assignment: Hive's own
template hierarchy (Section -> Subsection -> Category -> Fields, with
Information / Limitations / Defects-Deficiencies as the category names)
maps cleanly onto the shape Spectora's export already uses (`Comment Type:
info/limit/defect`). That's a good sign for a Spectora migration path, but
it also suggests the template-import workflow could offer that mapping
explicitly during import - i.e. surface "This Spectora comment type will
appear under your Defects/Deficiencies category" as part of the import
preview, rather than leaving the customer to discover the correspondence
themselves after the import completes.

## Binsr comparison

Not explored in this pass - time was prioritized on the core importer,
editor, duplication, tests, and documentation per the assignment's explicit
guidance to protect the required baseline over the optional comparison.
