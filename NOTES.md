# NOTES

## The customer problem

An inspection company has spent years - the assignment says four - tuning
a Spectora template: the exact sections, items, and wording their
inspectors use on every job. Moving to new software is a non-starter if it
means retyping all of that by hand. The customer problem this project
solves is narrow and concrete: take that company's actual Spectora export,
bring it into a new system without losing or silently rewriting anything,
and let an inspector pick up editing it immediately - including making a
copy to adapt for a different property type without touching the
original. Trust is the product here more than any single feature: an
inspector who can't tell whether their template survived the move intact
won't switch, regardless of how good the rest of the software is.

## What was built

The full workflow, end to end:

```
Spectora "Export HTML Text" spreadsheet (.xls/.xlsx)
  -> upload
  -> validate + parse into a structured, in-memory template (nothing written yet)
  -> preview (counts + warnings) shown to the user for confirmation
  -> commit: one DB transaction creates templates/sections/items/comments
  -> editor: section names, item names, comment names, and comment text
     are all independently editable, each field saving itself the moment
     it loses focus
  -> Add section / Add item / Add comment: the inspector can append new,
     empty rows at any of the three levels the importer itself builds, for
     content the original Spectora export didn't have, then rename/edit
     and duplicate them exactly like imported rows
  -> Save & Back / Back to Templates: a page-level status bar makes it
     clear whether anything is still unsaved before returning to the list
  -> duplicate: a full, independent deep copy the user can then edit
     without ever touching the original
  -> delete: a confirmed, permanent removal for template housekeeping
  -> retrieval: closing the app, reopening it, or reloading the browser
     shows exactly what was last saved, for the original and every copy
```

- A generic parser for Spectora's "Export HTML Text" spreadsheet format
  (`src/lib/importer/`), driven entirely by column headers rather than
  positions, template names, or row counts - it works on the committed
  InterNACHI Residential export and was confirmed to work on a second,
  different real export too (see "Generalization test").
- A structured, editable data model: `templates -> sections -> items ->
  comments`, each with an explicit `position` column for ordering. Comment
  HTML is stored as sanitized HTML in a text column, not folded into one
  opaque blob.
- A three-step import pipeline: validate -> parse -> **preview** (nothing
  written yet) -> commit (one DB transaction).
- An editor: section names, item names, comment names, and comment text
  are all editable and persist to Postgres, each field saving itself
  independently on blur (see "Editing and the Save workflow" for the full
  explanation of how this behaves and what was added around it). Other
  per-comment fields from the export (answer type, multiple-choice
  options, severity, recommendation) are shown read-only, preserved
  losslessly, not yet editable (see "What was intentionally cut, and why").
- Template duplication: a full deep copy (new IDs throughout) in one
  transaction, verified independent of the original by an automated test
  and by repeated manual testing, locally and in production.
- Template deletion: a simple, confirmed, permanent delete (see "Template
  deletion" below for why this and not a recycle bin).
- **Add section / Add item / Add comment**: the editor extensions added
  beyond renaming existing imported content, matching exactly the three
  levels the importer itself builds - see "Editor extension: Add section /
  Add item / Add comment" for the full evaluation and why this was chosen
  over the alternatives.
- Photo/image URL preservation: `Default Photo 1-10` and their captions
  are captured per row, not just flagged as an unrecognized column (see
  "Photo/image preservation").
- A failure case: uploading a corrupted file or a workbook missing the
  required columns produces a clear, specific error and writes nothing to
  the database (verified both manually and by a rolled-back-transaction
  test).
- Automated tests: 16 parser unit tests (no DB required) + 15 DB integration
  tests (persistence, editing, duplication/independence, deletion, adding a
  section/item/comment at each level (including that each duplicates and
  stays independent), transactional rollback).

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

## Technical stack

The actual stack, not a wishlist:

- **Frontend**: Next.js 16 (App Router) + React 19 + TypeScript. Server
  Components render the template list and editor; a handful of small
  Client Components (`EditableField`, `CommentCard`, `Accordion`,
  `DuplicateButton`, `DeleteTemplateButton`, the editor status bar) handle
  the interactive parts. Tailwind CSS v4 for styling.
- **Backend**: Next.js Server Actions (`src/app/actions.ts`) - no separate
  REST/API layer. Each mutation (import, edit, duplicate, delete) is a
  single typed server function called directly from the UI.
- **Database**: PostgreSQL. Supabase-hosted in production; any Postgres
  works for local development (see README).
- **ORM/data access**: Drizzle ORM (`drizzle-orm`, `drizzle-kit`) with the
  `postgres` driver. Migrations are plain SQL files checked into `drizzle/`.
- **Deployment**: Vercel, deployed from the project root with no custom
  build configuration beyond the standard Next.js build.
- **Import/parsing**: `exceljs` reads the uploaded workbook into a plain
  row/column grid (chosen over `xlsx`/SheetJS, which has open, unpatched
  security advisories - see DECISIONS.md).
- **Sanitization**: `sanitize-html` allowlist-sanitizes comment HTML, run
  on both import and every edit. `he` decodes HTML entities in plain-text
  name fields.
- **Testing**: Vitest for both the parser unit tests (no database) and the
  Postgres integration tests.

## Data model

`templates -> sections -> items -> comments`, each a real table with a
foreign key to its parent (cascading on delete) and an explicit integer
`position` column for ordering:

- **templates**: id, name, description, source format/filename, timestamps.
- **sections**: id, template_id, name, position.
- **items**: id, section_id, name, position.
- **comments**: id, item_id, name, position, plus dedicated typed columns
  for the fields the editor and preview actually use directly
  (`text_html`, `comment_type`, `severity`, `answer_type`,
  `multiple_choice_options`, `unit_type_options`, `recommendation`,
  `default_value`), and one `source_metadata jsonb` catch-all for
  low-signal export fields (see "Import mapping" and "Photo/image
  preservation").
- **imports**: one row per import attempt (committed or failed), recording
  counts and warnings so they're visible after the fact, not just at
  import time.

This is structured and editable on purpose, per the assignment's explicit
requirement that a whole template stored as one opaque HTML blob is not
acceptable (HTML inside an individual comment field is fine, and that's
exactly where it lives - in `comments.text_html`, sanitized). Because
sections/items/comments are real rows with real relationships, editing a
name is a one-column `UPDATE`, and duplicating a template is a
straightforward deep copy across three tables with new IDs - neither would
be sensible operations against a single JSON/HTML blob.

## Import mapping

`src/lib/importer/headers.ts` maps each canonical field (Section Name, Item
Name, Comment Name, Comment Text, Comment Type, Category, etc.) to whichever
column in the uploaded sheet has that header text, normalized (case,
whitespace, and the human-readable parenthetical hint stripped) - not by
column position. `src/lib/importer/mapRows.ts` then walks the data rows in
order: a `(Section Name, Item Name)` pair is grouped into the same
section/item wherever it recurs in the sheet (items are unique within their
section, not globally - see "Actual structure found in the committed
export"), each row becomes one comment, and `position` is assigned from the
row's position in the sheet, not the export's own `Order` column (see
DECISIONS.md for why). Anything in the header row that isn't a recognized
canonical column is preserved as a named warning rather than silently
ignored.

## Supported input format

Single-sheet `.xls`/`.xlsx` workbook (Spectora's export is actually OOXML
despite the `.xls` extension) with a header row. Required columns: `Section
Name`, `Item Name`, `Comment Name`. Optional, recognized columns: `Comment
Text`, `Comment Type (info, limit, defect)`, `Category (-1: Low, 0: Med, 1:
High)`, `Multiple Choice Options`, `Unit Type Options`, `Recommendation`,
`Order (w/i item)`, `Answer Type`, `Default Value`, `Default Value 2`,
`Default Unit Type`, `Default Location`, `Default Estimate Min/Max`,
`Locked`, `Simple Format`, `Disable Photos`, `Uses`, `Default Photo 1-10 (+
captions)`, `Last Modified`. `Default Photo 1-10` and their captions are
recognized and their per-row values captured (see "Photo/image
preservation" below), not just noted as present. Column order does not
matter (headers are matched by normalized text, not position); an export
with extra, unrecognized columns still imports, with a warning naming the
columns that weren't mapped to a field.

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
  conceptually onto the Information / Limitations / Defects/ Deficiencies
  categories confirmed directly in Hive's own template editor (see "Hive
  product feedback" below), though the importer does not force values into
  that exact vocabulary (another export could use different comment types).
- `Section Name` / `Item Name` contain literal HTML entities as plain text
  (e.g. the string `"Crawlspace &amp; Structure"`, not an actual `&`) in 107
  and 158 rows respectively - these are HTML-decoded on import so they
  display correctly. `Comment Name` never had entities in this export, but
  is decoded defensively too.
- `Locked`, `Simple Format`, `Disable Photos`, `Default Value 2`, `Default
  Unit Type`, and `Default Location` columns are present in the header but
  **100% empty** in every row of this export - genuinely absent from the
  source, not something the importer failed to read. The 20 "Default Photo
  1-10 (+ captions)" columns are *also* 100% empty in this particular
  export, but are not empty in every Spectora export - see "Generalization
  test" and "Photo/image preservation" below.

## Generalization test: a second Spectora export

The assignment explicitly calls out that "we may try another export in the
same HTML-text format" and that the importer "should work beyond the exact
template you committed." To check that directly (not just via the
synthetic-header tests in `mapRows.test.ts`), a second, real Spectora
export was run through the full app: `ASHI Residential Inspection` (same
"Export HTML Text" format, different template, different data).

Result, through the actual running app (upload -> preview -> commit -> open
in the editor), with the current importer:

- **12 sections, 62 items, 355 comments** - all 355 data rows mapped
  cleanly, zero warnings.
- Same header-driven column resolution, same sanitizer, same schema - no
  ASHI-specific code exists anywhere in the importer. This is the concrete
  evidence (not just the design argument) that header-driven matching does
  what it's for.
- This export is *not* committed to the repo (only the InterNACHI export
  the assignment asks for is) - the numbers above come from actually
  running it, not from memory or estimation.
- Running this test left the ASHI file sitting, untracked, in the project
  root - which exposed a real fragility: `scripts/seed.ts` originally picked
  "the first `.xls`/`.xlsx` file in the project root" by directory-listing
  order, which is not alphabetical or otherwise guaranteed (confirmed
  directly: `readdirSync` returned ASHI before InterNACHI on this machine).
  With two candidate files present, a fresh `npm run seed` would have
  silently seeded the wrong template. Fixed by making the script refuse and
  name all candidates when more than one is found, rather than guessing -
  consistent with this project's existing rule of never resolving ambiguity
  silently (see the importer's own warnings). No filename is hardcoded
  either before or after this fix; the fix is about failing loudly on
  ambiguity, not about picking a specific file.

## Photo/image preservation

`Default Photo 1-10` and their captions are recognized columns whose
per-row *values* are captured into `comments.sourceMetadata.photos` (an
array of `{ slot, url, caption }`), not just column names noted in a
warning. This was tightened during final QA: earlier, these 20 columns were
present in `CANONICAL_COLUMNS` nowhere at all, so a real value in one of
them would only ever surface as a generic "Unrecognized column(s)..."
warning naming the column - true, but not honest about the fact that a
specific row actually had content in it.

- An empty photo slot is not stored and produces no warning - it isn't
  meaningful content, so there's nothing to flag.
- A URL is only kept if its scheme is `http` or `https` (same convention as
  comment-body links in `sanitizeComment.ts`); anything else (`javascript:`,
  `data:`, etc.) is rejected and reported as a warning naming the comment
  and photo slot, never stored.
- The editor (`CommentCard.tsx`) shows a small "Imported photo N" chip per
  photo, with a thumbnail if the browser can load the external URL and a
  safe fallback icon (still a working link to the original URL) if it
  can't - preservation and visibility, not a media manager.
- Checked against both real exports: the committed InterNACHI export has
  zero real values across all 20 photo/caption columns (genuinely empty
  source data, confirmed by direct inspection - not an importer gap). The
  ASHI export has one: row 14, `Structural Components -> Foundation,
  Basement & Crawlspaces -> Material`, `Default Photo 1` =
  `https://cdn.spectora.com/default_photos/images/005/616/856/original/spectora_full_logo_white.png?...`
  (Spectora's own default/placeholder photo, not real customer content, but
  a real non-empty value in a real export). Traced end-to-end - source file
  -> parser -> `sourceMetadata` -> Postgres -> editor UI - and confirmed the
  exact URL survives unchanged at every step.

## Formatting, links, and rich content

- What exists in the source: `Comment Text` contains HTML - specifically
  `<p>` (244 occurrences), `<a href>` (43, all `http`/`https`, zero
  `javascript:`), one `<strong>`, and one `<div>`.
- What we preserve: `<p>`, `<a href>` (http/https/mailto only), `<strong>`,
  `<b>`, `<em>`, `<i>`, `<ul>`, `<ol>`, `<li>`, `<br>`, `<div>`. The
  sanitizer's `transformTags` adds `rel="noopener noreferrer"
  target="_blank"` to preserved links. An earlier pass found this attribute
  addition wasn't taking effect - `sanitize-html` applies `allowedAttributes`
  filtering *after* `transformTags` runs, so `rel`/`target` were being
  stripped right back out because `allowedAttributes.a` only listed `href`.
  Root-caused and fixed in this pass by adding `rel`/`target` to
  `allowedAttributes.a` (`src/lib/importer/sanitizeComment.ts`) - confirmed
  directly (`sanitizeHtml` called standalone with and without the fix) rather
  than assumed. Not a security issue either way (the scheme allowlist below
  runs independently and still rejects unsafe schemes) - this was a
  usability gap, now closed.
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
  information (e.g. the YouTube embed above, or - in the committed
  InterNACHI export specifically - the 20 photo/caption columns, which are
  100% empty there). Nothing was lost by this importer - there was nothing
  to import. (The photo *columns* are recognized and their values *are*
  captured when present - see "Photo/image preservation" above; this bullet
  is about the InterNACHI export's own data being empty, not about importer
  support.)
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
  template, edits the copy, asserts the original's data is byte-for-byte
  unchanged, and (added in final QA) deletes a template and asserts it and
  all of its sections/items/comments are gone, and that deleting an
  already-gone template is a safe no-op rather than an error.
- Manually, locally: imported the real InterNACHI fixture and the second
  ASHI export through the running app, opened the editor, confirmed section/
  item/comment counts and warning banner matched the preview, edited a
  section name, an item name, and a comment's text (each followed by a hard
  browser refresh to confirm the edit was actually persisted, not just
  showing client-side), duplicated a template, edited the copy, confirmed
  the original was untouched via a direct database read, deleted a test
  template through the new Delete UI and confirmed it and its dependent
  rows were gone, and confirmed Cancel on the delete dialog makes no
  request at all.
- Manually, against the live production deployment (not just local): the
  same edit -> refresh -> persist check, the same duplicate -> modify copy
  -> verify original unchanged check, and the same photo-preservation check
  (import ASHI, confirm the "Imported photo 1" chip appears on the exact
  row-14 comment) were repeated directly against the deployed app and the
  real production database, then the test data created for those checks was
  deleted again, leaving production with only the intended single seeded
  template.
- In a later pass (Save workflow + accordion fix): re-verified, not
  assumed, that nothing above regressed - reran the full automated suite,
  reimported both real exports fresh (same 13/69/392 and 12/62/355), and
  specifically confirmed via the DOM (both locally and in production) that
  opening a section and a nested item, then triggering a real save,
  left both still open, where before the fix they would have closed. Also
  exercised the new status bar directly: confirmed it shows "Unsaved
  changes" the moment a field is edited but not yet blurred, "All changes
  saved" immediately after, and that clicking "Save & Back to Templates"
  with a field still focused and dirty actually persists that edit (via a
  direct database read) before navigating away - not just after enough
  time happened to pass.
- In the Add Section pass: re-verified the entire baseline above again
  (fresh imports of both real files, edit/reload, duplicate/independence,
  photo preservation, both failure cases, rich content) still holds
  unchanged, both locally and in production, before adding anything new -
  then tested Add Section itself the same way: created a section, renamed
  it, duplicated the template, renamed the copy's added section, and
  confirmed via direct database reads that the original was untouched -
  on both the local database and the live production database.

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

## Editing and the Save workflow

**How it actually works.** Every editable field (section name, item name,
comment name, comment text) is its own small Client Component holding its
own value and save state. There is no explicit "Save" step underneath -
each field calls its own Server Action the moment it loses focus (on Tab,
click-away, or Enter) and shows its own Saving/Saved/error indicator. There
was never a client-side draft or transaction: what you see saved is what's
in Postgres, field by field, as you go. The risk this carries is genuine
but narrow: a field that has been typed into but not yet blurred - closing
the tab or losing power mid-edit before that blur fires - loses that one
field's edit, since nothing is sent to the server until then. Once a field
blurs, its write is a normal, already-persisted database update; navigating
away after that changes nothing.

**What was added, and why.** With 12+ sections and hundreds of comments,
that per-field model felt directionless - there was no way to tell "am I
done here" or get back to the template list with any confidence, and
`revalidatePath` (called after every single save so the page reflects the
new value) was rebuilding the whole page's DOM, which silently closed every
open section/item on every keystroke's blur. Two small, additive pieces
were built around the existing model, without changing how or when
anything is actually written:

1. **A page-level status bar** (`EditorStatusBar.tsx` / `EditorStatusContext.tsx`).
   Each field reports "dirty" (typed, not yet saved), "saving", or
   "error" into a shared context; the bar shows one honest answer -
   "All changes saved," "Unsaved changes," "Saving...," or "Some changes
   failed to save" - instead of the user having to scan dozens of
   individual field indicators. It also gives two clear ways back to the
   template list: a plain **Back to Templates** link, and **Save & Back to
   Templates**, which blurs whatever's currently focused (so a pending
   edit fires its own save right now, exactly as it would on Tab) and then
   navigates once nothing is left in flight. Neither button introduces a
   new write path - "Save" here means "make sure the per-field saves
   you'd already trigger by clicking away have actually happened," not a
   new bulk-save mechanism. Clicking either with no pending edits performs
   zero additional writes.
2. **The accordion-collapse fix.** The reported issue was real: because
   `<details open>` is native, uncontrolled browser state and the page is
   a Server Component that fully re-executes on every `revalidatePath`,
   the open/closed state of every section and item was lost on every
   single save. The fix was small and contained: `Accordion.tsx` wraps
   `<details>` in a Client Component that controls `open` via its own
   `useState`, updated through the native `toggle` event. A Client
   Component's hook state survives a surrounding Server Component
   re-executing around it (React preserves it by matching component type
   and key, independent of the server-rendered markup being rebuilt), so
   a section or item stays exactly as open or closed as the user left it
   through any number of saves. This was verified directly, not assumed:
   opening a section and a nested item, editing a comment inside it
   (triggering the real save + revalidate path), and confirming via the
   DOM that both remained open - done both locally and against the live
   production deployment.

**What this deliberately did not become.** No draft/versioning system, no
"unsaved changes" browser-navigation guard (`beforeunload`), no batched
transactional save across multiple fields. The persistence model - each
field commits itself independently - is unchanged; everything above is a
UI layer that makes the existing behavior legible, not a new one.

## Template deletion

Not required by the assignment (the baseline is import / edit / copy /
store / model; delete is never mentioned). Added anyway, during final QA,
because there was no way to clean up a stray or duplicate template - from
testing, or from an inspector importing the wrong file - without touching
the database directly. `deleteTemplate()` already existed in
`src/db/repo.ts` (used only by the test suite's own cleanup); this pass
wired it up to a real `deleteTemplateAction` Server Action and a
`DeleteTemplateButton` (template list and template detail page), with an
explicit confirmation dialog naming the template and stating the action is
permanent, before anything is deleted. Cascading FK deletes (already
defined in the schema) remove the template's sections/items/comments in the
same statement; deleting an already-deleted template is a safe no-op, not
an error, and no raw database error is ever shown to the user.

**Deliberately a simple permanent delete, not a 30-day recycle bin.** A
recycle bin would need either a `deletedAt` column plus filtering it out of
every existing query and a scheduled sweep to actually purge old rows, or a
separate archive table - real schema/query surface for a capability outside
the assignment's baseline, on top of the assignment's own explicit "we do
not expect a complete product in two days" guidance. A confirmed permanent
delete with a clear, specific warning is sufficient for template
housekeeping in this workflow and adds no schema risk this late in the
build.

## Editor extension: Add section / Add item / Add comment

**Not the assignment's required "one improvement"** (that's import trust -
see "Customer-focused improvement" below). This is a separate, smaller
scope decision, made across two passes, in response to an explicit prompt
to inspect the application and decide whether additional editor capability
would make it materially more useful, without turning it into a
template-building platform.

**The customer problem it addresses.** Editing, before this, meant renaming
things the Spectora export already contained - the template was still
frozen to whatever structure the old system produced. But migration is
rarely the end of the story: an inspection company adopting a new system
often uses the moment to add something their old template never had -
e.g. a "Pool & Spa" section for a subset of properties, a new item within
an existing section, or one more comment/answer field on an item that
already exists. Without a way to add structure at every level the importer
itself builds, the customer's only real option would be re-importing a
hand-edited spreadsheet, which defeats the point of having a structured
editor at all.

**First pass: Add Section only.** Add Item and Add Comment were initially
evaluated and *deliberately not built* alongside Add Section, for a
specific reason: a newly-created comment has sibling fields
(`commentType`, `severity`, `answerType`, `multipleChoiceOptions`,
`unitTypeOptions`, `recommendation`, `defaultValue`) that the editor
doesn't build input controls for, so what should a blank comment's values
be? Add Section had no such problem - a section is just a name and a child
list - so it shipped alone first.

**Second pass: extended to Add Item and Add Comment, matching exactly what
the importer itself builds.** On review, the concern above turned out to
be smaller than it first looked: every one of those sibling columns is
already **nullable** in the schema (`comments.severity`, `.answerType`,
etc. - see `schema.ts`), and plenty of real imported comments already have
all of them null (a comment with no severity or answer type is a normal,
valid row today, not an edge case this would be inventing). So a
manually-added comment simply starts with `name` filled in and every other
field null - the exact same shape the editor already displays correctly
for real imported data, requiring zero new UI beyond what `CommentCard`
already renders for a "blank" field. `createSectionAction`,
`createItemAction`, and `createCommentAction` are now symmetric: each adds
a new row at the bottom of its parent, matching the three-level hierarchy
`templates -> sections -> items -> comments` the importer builds - there is
no separate "subsection" anywhere in this data model, so "add a
subsection" is "add an item."

**A blank "New Template from scratch" button** was considered and rejected
in the first pass and remains rejected: it doesn't serve the migration
workflow this project is actually about - the assignment is explicitly
framed around bringing in an *existing* Spectora template, not authoring
one from nothing. That's a real, separate product surface (template
authoring), not an extension of the migration/editing workflow built here.

**Why it stayed low-risk even after extending to three levels.** No schema
or migration changes at any point - `createSection()`, `createItem()`, and
`createComment()` (`src/db/repo.ts`) are each a single `INSERT` using the
exact tables, the same `position` = `existing count` append convention the
importer itself uses, and the cascading-FK behavior every other row
already relies on. Duplication needed zero new code at any level:
`duplicateTemplate()` already iterates over whatever sections/items/
comments a template has, so a manually-added row at any depth is copied
and made independent automatically, with no special-casing per level.

**What was implemented, precisely**: one reusable `AddChildForm.tsx`
component (replacing the earlier section-only `AddSectionForm.tsx`) used
at all three levels - a "+ Add section" control below the section list, a
compact "+ Add item" control at the bottom of each section's item list,
and a compact "+ Add comment" control at the bottom of each item's comment
list - each bound to its own `create*Action` Server Action. A new row
renders and behaves exactly like an imported one everywhere else: editable
via the existing `EditableField`/`CommentCard`, included automatically in
duplication, and removable only by deleting the whole template (no
per-row delete was added, at any level - out of scope for this extension).

**What was deliberately not built alongside it**: drag-and-drop or manual
reordering of sections/items/comments, a blank/from-scratch template
creator, per-row delete (section, item, or comment), and any input control
for a comment's type/answer-type/severity/options - those remain read-only
display fields, same as for imported comments (see "What was intentionally
cut, and why").

**How it was tested**: nine DB integration tests total
(`src/db/__tests__/repo.test.ts` - "createSection (Add section)",
"createItem (Add item)", "createComment (Add comment)", three each) -
each level appends at the correct position and survives a fresh read; an
empty/whitespace-only name is rejected without writing anything at any
level; a manually-added section, item, or comment is included when its
template is duplicated and stays independent of the original after the
copy's row is edited. For the comment case specifically, the test also
asserts every sibling field (`textHtml`, `commentType`, `severity`,
`answerType`, `multipleChoiceOptions`, `sourceMetadata`) is null on
creation, confirming the "matches an already-valid real shape" reasoning
above, not just an assertion about it. Manually, locally and against the
live production deployment: created a section, an item within it, and a
comment within that item; renamed/edited each with the existing editor;
duplicated the template; edited the copy's added rows; confirmed via
direct database reads that the original was untouched at every level; and
confirmed the accordion-persistence fix (see "Editing and the Save
workflow") still holds when adding at any level, not just when editing an
existing field. One real bug was caught and fixed during this pass, not
in the feature itself but in how the feature was first wired: an early
version of the Add Item/Add Comment JSX passed a plain arrow-function
closure as the `onCreate` prop from the Server Component page to the
Client Component form - Next.js requires a Server Action reference (a
bound action, matching the existing `onSave={...Action.bind(null, ...)}`
pattern already used for renaming) for a function passed across that
boundary, not an arbitrary closure. Caught immediately by testing the live
UI end to end rather than stopping at a passing `next build` - typecheck
and lint do not catch this class of issue, only exercising the real
request does.

## Approximate time spent

This is an estimate reconstructed from the git history and the scope of
each pass, not a tracked number - treat it as an order-of-magnitude range,
not a precise figure.

- **Baseline build** (one focused session): source-file inspection and
  format discovery, scaffolding, importer + tests, persistence + editor +
  duplication, browser-driven end-to-end verification, and documentation.
- **First QA/delivery-prep pass** (shorter follow-up session): a full
  requirements audit against the assignment PDF, the photo-preservation
  fix, the delete feature, production database cleanup, and a NOTES.md
  update.
- **Third pass** (Save workflow + accordion fix): the Save-workflow status
  bar, the accordion-collapse fix, re-verification of the photo/delete/
  rich-content behavior after those UI changes (locally and in
  production), a further production cleanup, and a documentation update.
- **Fourth pass** (product-improvement evaluation): inspecting the
  application against the assignment's actual baseline, evaluating several
  candidate editor extensions against explicit criteria, implementing the
  one chosen at the time (Add section), full regression testing of the
  existing baseline plus the new feature (locally and in production),
  another production cleanup, and a documentation update. Also produced a
  full walkthrough-prep audit of the entire project (problem statement,
  PDF requirement table, architecture trace, codebase map, testing/ground
  truth, security, scalability, and a walkthrough script) as a separate,
  read-only deliverable.
- **This pass** (extending Add Section to Add Item and Add Comment):
  comparing the existing Add Section pattern against what the import
  pipeline actually builds (three levels, not two), extending the same
  pattern to items and comments with a single generalized reusable
  component instead of three near-duplicate ones, adding matching tests,
  finding and fixing a real Server Action wiring bug (a plain closure
  passed where a bound action reference was required) caught only by
  testing the live UI, full regression testing of the whole baseline
  again, and this documentation update.

Altogether, low-to-mid single-digit hours across the five passes, not a
sustained multi-day effort - consistent with the assignment's "two focused
days, hackathon style" framing when the actual coding time (as opposed to
elapsed calendar time across sessions) is counted.

## Production seed

The deployed app is intentionally seeded with exactly one already-imported
template (`InterNACHI Residential -2026-09-19`, the committed export) so it
opens with real, explorable content per the assignment's "seed the live app
with a template you have already imported" requirement. Stray/duplicate
templates that had accumulated on the production database from earlier
manual testing were removed during final QA using the delete feature above,
so the live app's template list is exactly one row, not several.

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

Also used, in a separate final-QA pass, for: a full audit of the codebase
against the assignment PDF's actual requirements, the photo-metadata
capture fix and its tests, the delete feature and its tests, driving the
same end-to-end browser verification both locally and against the live
production deployment, and cleaning up test data from the production
database via the newly-added delete feature.

And again, in this final implementation pass, for: inspecting the actual
current edit/save code (not assuming the earlier documentation of it was
still accurate) before changing anything, implementing the editor status
bar and the accordion-collapse fix, re-verifying photo preservation, rich
content, duplication, and delete behavior directly via a real browser
against both the local app and the live production deployment rather than
by re-reading code, and writing this update. Every count and behavior
claim in this file was re-checked by actually running the current code, not
carried forward from a previous session's notes on the assumption that it
still held.

Once more, in this final product-improvement pass, for: inspecting the
actual current application (UI, schema, repo, server actions, tests,
NOTES.md, README.md, the assignment PDF) before proposing anything;
evaluating Add Section against the alternatives using the given criteria
rather than defaulting to it; implementing only that one feature
end-to-end (repo function, Server Action, UI, tests); re-running the full
existing baseline (import, edit, duplicate, delete, photo preservation,
failure handling) to confirm nothing regressed, before and after the
change; and verifying the new feature itself the same way - locally and
against the live production deployment, cleaning up every piece of test
data created along the way.

Once more, in this pass (extending to Add Item / Add Comment), for:
comparing what "Add Section" already did against what the import pipeline
actually builds (three levels, not one) before writing anything;
generalizing the existing single-purpose form into one reusable component
rather than duplicating it; writing matching tests at each level; and,
critically, catching a real bug (a Server Action passed as a plain closure
instead of a bound reference) by actually exercising the live UI end to
end rather than stopping once `npm run build` succeeded - `tsc` and
`eslint` both passed on the broken version, since this class of error only
surfaces at runtime, when Next.js tries to serialize the function across
the server/client boundary.

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

## What was intentionally NOT built (this pass)

1. Editable multiple-choice options and answer type in the editor.
2. A real rich-text (WYSIWYG) editor for comment text, since the plain-
   textarea-plus-preview approach is honest but not ideal for a non-
   technical inspector.
3. Binsr exploration and comparison, as encouraged (not required) by the
   assignment.
4. Bulk operations (reorder sections/items via drag-and-drop; the
   `position` columns already support this, only the UI is missing).
5. A 30-day recycle bin for deleted templates - see "Template deletion."
6. A `beforeunload` warning or client-side draft/versioning system around
   editing - see "Editing and the Save workflow" for why the existing
   per-field autosave model was extended with a status bar instead of
   replaced with something heavier.
7. ~~Fix `rel`/`target` not actually being added to preserved comment
   links~~ - **resolved in a later pass**: root-caused (`allowedAttributes`
   filtering runs after `transformTags`, stripping the two attributes back
   out) and fixed by adding them to `allowedAttributes.a` - see "Formatting,
   links, and rich content."
8. **A from-scratch "New Template" creator.** Evaluated and rejected - see
   "Editor extension: Add section / Add item / Add comment" for why it's a
   separate product surface (authoring) rather than an extension of the
   migration workflow. (Add Item and Add Comment were also evaluated here
   originally and rejected for that first pass, but were built in a later
   pass once the "what does a blank comment default to" question had a
   real answer - see that same section.)
9. **Per-row delete for a section, item, or comment.** Only whole-template
   delete was built; removing one row (including a manually-added one)
   requires deleting and recreating the template, or simply not adding it
   in the first place.

**Resolved since it was first noticed**: the editor previously collapsed
every open section/item back to closed after each individual field save.
This was fixed (see "Editing and the Save workflow") rather than left as a
known limitation, once it turned out to be a small, low-risk, well-scoped
change (a Client Component controlling `<details open>` via its own
`useState`) rather than a deeper architectural problem.

## Potential future extensions

Not built, not planned for this delivery - listed because a real product
team would eventually face these, and it's worth being explicit about
which ones this project's actual shape makes reasonable next steps versus
which ones are unrelated speculation:

- **Template version history / restore a previous version.** The current
  schema overwrites a field's value on every edit with no history. The
  `imports` table already shows the shape this could take (one row per
  significant event); a similar append-only table per field-level edit
  would be the natural extension, without changing the live schema.
- **30-day recycle bin for deleted templates.** Deliberately not built
  now (see "Template deletion"); would matter if this app ever handled a
  customer's only copy of a template rather than something re-importable
  from the original Spectora export.
- **Richer photo/media handling.** Right now a `Default Photo N` value is
  a preserved URL with a best-effort thumbnail. A production version might
  proxy/cache these images server-side so they don't depend on the
  original CDN staying up or allowing hotlinking, and would need a real
  answer for what happens when Spectora eventually starts including actual
  photo binaries rather than just URLs.
- **Drag-and-drop section/item reordering.** The `position` columns
  already carry the ordering; only the UI to change it via drag-and-drop
  (rather than only via the source import order) is missing.
- **Per-row delete for a section, item, or comment**, so a row added by
  mistake (or one the inspector decides they don't want) doesn't require
  deleting the whole template.
- **Editable answer type/options/severity for a newly-added comment**,
  once there's real input UI for those fields at all (see below) - today
  a manually-added comment's non-text fields stay null, same as many real
  imported comments.
- **Editable answer type / multiple-choice options / severity /
  recommendation.** Currently read-only display fields (see "What was
  intentionally NOT built").
- **A full WYSIWYG editor for comment text**, replacing the current
  HTML-textarea-plus-preview, once/if the customer's real content uses
  more formatting variety than the current export does.
- **Import conflict resolution / re-import into an existing template.**
  Today, importing again always creates a new template; there's no path
  for "re-sync this template against an updated Spectora export" without
  hand-reconciling the two afterward.
- **User authentication and per-organization templates.** This is
  explicitly out of scope for the assignment and the app has no auth
  layer at all; a real multi-customer product would need this before any
  of the above matters.
- **Background processing for very large imports.** The current import
  runs synchronously inside one request/transaction; this is fine at the
  ~400-row scale of the real exports tested here, but a template with
  tens of thousands of rows (or many photo columns needing server-side
  fetching, per the point above) would eventually want to move off the
  request/response cycle.

A few more, added on reflection - each a direct extension of what already
exists, not a new product surface:

- **Template diff / comparison view.** The data model already supports it
  (two `templates` rows, same shape) - a side-by-side or unified diff
  between a template and its duplicate (or between two versions once
  version history exists) would give the customer direct, visual proof that
  "nothing changed except what I meant to change," which is the exact
  anxiety this whole project is about addressing.
- **In-editor search/filter.** At 12+ sections and 300-400+ comments,
  finding one specific item or comment today means expanding accordions by
  hand. A client-side filter over the already-loaded tree (no schema or
  server change) would matter the moment a real inspector's template is
  this large.
- **Bulk find-and-replace across a template.** Item names repeat by design
  across sections (e.g. "General" in 8 sections in the committed fixture);
  renaming a recurring item consistently today means editing it once per
  section by hand.
- **Multi-file import.** An inspection company migrating from Spectora
  likely has more than one template (residential, commercial, etc.);
  importing them one at a time today is a real limitation for that
  customer, not just a nice-to-have.
- **Export back out** (to a spreadsheet, or Hive's own format once that's
  documented) - so adopting this importer doesn't trade one lock-in for
  another, and so round-trip fidelity could be verified automatically
  instead of only by manual inspection.

Deliberately not listed: things like role/permission systems or a
general-purpose workflow/rules engine - these don't follow directly from
what this project actually does today, and listing them would be
speculation rather than a real extension of the current design.

## Customer-focused improvement (the one we chose)

**What it is**: import trust - the combination of preview-before-commit
(nothing is written to the database until the user explicitly confirms
what they're about to get), granular, per-row/per-comment warnings (not
one generic "some things were skipped" message), and a persistent
`imports` record so those warnings remain visible after the user has
navigated away and come back.

**Customer problem it solves**: an inspector migrating four years of tuned
template content has no way to verify, on their own, that a new system
actually understood their file correctly. Silence read as success is
exactly what erodes trust the moment they later discover something was
wrong.

**Why it matters more than alternatives**: a nicer editor or WYSIWYG
support would improve day-two usability, but it doesn't touch the
moment that actually determines whether this customer keeps trusting the
migration - the instant they hit import. Getting that moment right (show
exactly what will happen, let them back out before anything is written,
never bury a real problem in silence) is the highest-leverage place to
spend effort for a customer whose entire objection to switching is "will
I lose anything."

**How it works technically**: `previewImportAction` (`src/app/actions.ts`)
runs the full parse pipeline and returns stats + a warnings list without
calling `commitImport` - nothing touches the database. Warnings are typed
(`ImportWarning`) with an optional row/section/item/comment reference, not
free text, so the UI can show exactly what was affected. On commit, the
same warnings are persisted into the `imports` table alongside the
resulting `templateId`, so they're visible again later on the template
page ("Imported with N warnings...") - not just in the one-time preview
screen.

**How it was validated**: `mapRows.test.ts` has dedicated cases for each
warning type (unsupported HTML, unsafe link scheme, non-numeric category,
duplicate comment name, unrecognized column, unsafe photo URL scheme);
manually, by uploading both real exports and confirming the preview
counts/warnings matched what direct inspection of the source files found
(see NOTES.md throughout); and by confirming, via the database, that a
preview never creates rows and a failed import never leaves a partial
template.

## Most valuable feature

**Faithful, structured import** - the deterministic, header-driven parser
that turns a Spectora spreadsheet into `templates -> sections -> items ->
comments` correctly and repeatably. Not the editor, not the UI polish, not
the Save-workflow status bar added in this pass.

**Why this and not something else**: everything else in the app is only
valuable if this step is trustworthy. Editing is worthless if what got
imported doesn't match the source. Duplication is worthless if the thing
being duplicated is already wrong. The customer's actual ask, in the
assignment's own words, is "preserving that work matters more than
originality" - and the piece of this project that carries that
responsibility, end to end, is the import pipeline: header-driven column
resolution that doesn't assume one fixed layout, deterministic mapping
that produces the same structure every time (no model, no guessing),
explicit preservation of hierarchy and ordering, and now per-row capture of
even low-signal fields like Default Photo URLs rather than treating
anything unfamiliar as safe to drop. The generalization test (a second,
different real export producing correct results with zero import-side
code changes) is the concrete evidence that this is genuinely solving the
stated problem, not just working for the one file it was built against.

## Quick reference

Short, direct answers to specific questions this project has been asked
about repeatedly, each pointing to the section with the full explanation.

1. **How does editing work?** Each field (section/item/comment name,
   comment text) is its own component that saves itself via a Server
   Action the moment it loses focus - see "Editing and the Save workflow."
2. **How does Save work?** There's no separate bulk-save; a page-level
   status bar aggregates each field's state and "Save & Back to Templates"
   makes sure a still-focused edit fires before navigating away - same
   section.
3. **How does persistence work?** Real Postgres via Drizzle ORM, one
   `UPDATE`/`INSERT` per action, verified via fresh database reads (not
   in-memory echoes) after every kind of edit - see "Data model" and "How
   preservation was checked."
4. **How does duplication work?** `duplicateTemplate()` deep-copies every
   section/item/comment with new IDs in one transaction - see `src/db/repo.ts`
   and the "Template deletion"-adjacent duplication tests in `repo.test.ts`.
5. **How does independent editing of a copy work?** The copy shares no
   row IDs with the original, so any edit only ever touches the copy's own
   rows - verified directly via database reads after editing a copy, both
   locally and in production, multiple times across passes.
6. **How are images/photo URLs handled?** Captured per row into
   `sourceMetadata.photos`, restricted to http/https, shown as a clickable
   "Imported photo" chip - see "Photo/image preservation."
7. **How is formatting handled?** An allowlist of tags preserved
   (`<p>`, `<a>`, `<strong>`, lists, etc.), everything else stripped and
   reported - see "Formatting, links, and rich content."
8. **How are links handled?** `http`/`https`/`mailto` preserved and
   rendered as real, clickable `<a>` tags; other schemes downgraded and
   flagged - same section (also notes a known, non-security `rel`/`target`
   cosmetic gap).
9. **What rich content is unsupported?** Tables, images embedded in
   comment HTML, embedded video, custom styling/classes - same section.
10. **Missing from the export vs. unsupported by us?** Explicitly tracked
    as two different things - see "Missing-from-export vs.
    unsupported-by-importer," with the YouTube-embed-wrapper as the
    concrete real example of "missing," and unsafe link schemes as the
    concrete example of "unsupported."
11. **How did we test preservation?** Automated fixture test against the
    real committed export, an automated DB round-trip test, and repeated
    manual verification locally and in production - see "How preservation
    was checked."
12. **How did we test a second Spectora export?** Ran the real ASHI
    export through the actual app (not just synthetic unit tests) and
    confirmed 12 sections / 62 items / 355 comments with zero warnings -
    see "Generalization test."
13. **How did we test failure cases?** Uploaded a corrupted file and a
    file missing required columns, confirmed clear errors and zero partial
    data via direct database checks - see "Failure cases (demonstrated)."
14. **Most valuable feature?** The faithful, structured, deterministic
    import pipeline - see "Most valuable feature" above.
15. **The one customer-focused improvement?** Import trust
    (preview-before-commit + granular warnings + a persistent audit
    record) - see "Customer-focused improvement (the one we chose)." (Add
    Section, covered separately under "Editor extension: Add section," is
    a different, smaller scope decision from a later pass - not a
    replacement for this answer.)
16. **Approximate time spent?** Low-to-mid single-digit hours across four
    passes, reconstructed from git history and scope, not tracked
    precisely - see "Approximate time spent."

## Hive product feedback

Verified directly against a live Hive Inspect trial account (Templates ->
a real template, expanding a section/subsection), not assumed: Hive's own
template hierarchy is Section -> Subsection -> Fields, with fields grouped
into three color-coded categories within each subsection - **Information**
(green), **Limitations** (yellow), and **Defects/ Deficiencies**
(orange/red, exact on-screen label, not "Defects-Deficiencies" as an
earlier draft of this note assumed). There is no separately-named
"Category" tier in Hive's own hierarchy counter (which literally counts
Sections / Subsections / Fields) - category is a grouping/coloring within a
subsection, not its own level.

That maps cleanly onto the shape Spectora's export already uses
(`Comment Type: info/limit/defect`). That's a good sign for a Spectora
migration path, but it also suggests the template-import workflow could
offer that mapping explicitly during import - i.e. surface "This Spectora
comment type will appear under your Defects/ Deficiencies category" as part
of the import preview, rather than leaving the customer to discover the
correspondence themselves after the import completes. (Not verified: how
Hive's own template-import/upload flow currently handles this - only the
template editor's hierarchy and category names were checked directly.)

## Binsr comparison

Not explored in this pass - time was prioritized on the core importer,
editor, duplication, tests, and documentation per the assignment's explicit
guidance to protect the required baseline over the optional comparison.
