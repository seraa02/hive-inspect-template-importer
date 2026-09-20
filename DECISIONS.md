# DECISIONS

Interview-prep notes. Not one of the four official deliverables (repo,
live URL, walkthrough video, NOTES.md) - this is for me to explain the
project confidently in a live discussion.

---

### Deterministic parser instead of an LLM for import mapping

**What was built:** A pure, header-driven parser (`src/lib/importer/`) that
maps spreadsheet rows to sections/items/comments with no model call
anywhere in the pipeline.

**Why this approach:** The Spectora export is a genuinely tabular,
consistently-columned format - I confirmed this by opening the real
committed file with `openpyxl` before writing any importer code (see the
column-by-column non-null counts and hierarchy dump in NOTES.md). A
deterministic parser can be unit-tested exhaustively (13 tests covering
valid input, missing values, malformed headers, duplicates, HTML
sanitization, link handling) and its behavior is provably stable across
runs. An LLM-based mapper would add non-determinism and a validation
burden (the assignment explicitly calls out needing to handle "malformed
output, invented sections, dropped content" from a model) for a problem
that doesn't need probabilistic reasoning - the structure is already there
in the columns.

**Alternative considered:** An LLM step to *interpret* ambiguous rows (e.g.
guess hierarchy when columns are missing). Rejected because the assignment
prioritizes "honest failures" over cleverness, and a missing required
column is exactly the kind of thing that should surface as a clear error,
not get guessed at.

**Result:** All 392 real comments parsed correctly on the first fixture
that exists; the same code path handles a synthetically-broken file
(missing headers) by throwing a specific, user-facing error instead of
guessing.

**Customer impact:** An inspector migrating four years of tuned template
content needs to trust that nothing was silently reinterpreted. Determinism
is the trust mechanism here, not accuracy stats.

---

### Header-driven column matching, not positional columns

**What was built:** `resolveColumnIndexes` (`src/lib/importer/headers.ts`)
looks up each canonical field by normalized header text, not column index.

**Why:** The assignment is explicit that "we may try another export in the
same HTML-text format" and that the importer must not be hard-coded to the
committed InterNACHI template. A column-position-based parser would break
the moment a different export reorders or adds columns; a header-driven one
does not care.

**Alternative considered:** Assuming Spectora always emits columns in the
same order (true for this fixture) and indexing by position. Rejected
specifically because the assignment calls this out as a requirement, not a
nice-to-have.

**Result:** Verified by a test that reorders/adds an extra column and
confirms the importer still finds the right fields and only warns about the
genuinely-unrecognized one.

---

### Source row order as the ordering signal, not the export's own `Order` column

**What was built:** `position` in the DB is assigned from the order rows
appear in the sheet, per (section, item) and (item) respectively. The
export's `Order (w/i item)` column is kept as metadata, not used for
sorting.

**Why:** Direct inspection showed `Order (w/i item)` is a reliable sort key
within `(section, item, comment_type)` for 110 of 115 real groups, but has
gaps or duplicate values in 5 - real-world messiness, not something to
paper over by "fixing" the source data. Row order, in contrast, is always
present and always monotonic - it's guaranteed to reconstruct the sheet's
visual order exactly.

**Alternative considered:** Trusting `Order (w/i item)` and sorting by it
directly. Rejected after finding the gaps/duplicates - sorting by an
unreliable field would have silently reordered a handful of real comments
in a way that's hard to detect without literally re-deriving the counts I
already had.

**Result:** The fixture-preservation test (`fixture.test.ts`) asserts exact
counts, and manual inspection in the editor confirms item/comment order
matches the source spreadsheet's visual order.

---

### Structured columns + a small `sourceMetadata` JSON catch-all, not one JSON blob

**What was built:** `comments` has dedicated columns for the
fields the editor and preview actually use (`text_html`, `comment_type`,
`severity`, `answer_type`, `multiple_choice_options`, `unit_type_options`,
`recommendation`, `default_value`), plus one `source_metadata jsonb` column
for the low-signal fields that exist in the header row but were 100% empty
in the real export (photo slots, `Locked`, `Simple Format`, etc.) and the
raw `Order (w/i item)` value.

**Why:** The assignment explicitly prohibits storing the whole template as
one opaque blob, and for good reason - it would make "section names,
item names, comment text are editable" require parsing JSON to mutate a
single field, and it would make the schema unexplainable. But building 10
more mostly-empty columns for fields this fixture never populates is
premature schema surface area for data that (in this export) doesn't exist.
The catch-all keeps those fields losslessly preserved without either
extreme.

**Alternative considered:** A fully normalized schema with a dedicated
table per field type (e.g. a `photo_slots` table). Rejected as
over-engineering for fields that are 100% null in the only real data I
have; the `sourceMetadata` column can absorb whatever the next real export
turns out to actually use, and a future migration can promote any field
that turns out to matter into its own column.

---

### Server Actions instead of a separate REST API layer

**What was built:** All mutations (`src/app/actions.ts`) are Next.js
Server Actions, called directly from Server and Client Components.

**Why:** For a single Next.js app with no external API consumers, a
separate `/api/*` route layer adds indirection (request parsing, response
shaping) with no client that needs it. Server Actions keep the mutation and
its authorization/validation in one typed function, colocated with the
repo layer that actually does the work.

**Alternative considered:** Next.js Route Handlers (`/api/import`,
`/api/templates/[id]`, etc.). This is the more "conventional" REST shape
and would be the right call if a mobile client or third party needed the
same endpoints - not the case here.

**Result:** `updateSectionNameAction`, `updateItemNameAction`,
`updateCommentAction`, `duplicateTemplateAction`, `commitImportAction` are
each a few lines, independently testable by calling the underlying repo
functions directly (which is what the DB integration tests do).

---

### `exceljs` instead of `xlsx` (SheetJS) for parsing the workbook

**What was built:** Workbook reading (`src/lib/importer/workbook.ts`) uses
`exceljs`.

**Why:** `xlsx`@latest carries two open advisories with no fix available
(prototype pollution, ReDoS) at the time of building this - `npm audit`
flags it high severity. Since this app accepts untrusted user-uploaded
files directly into this parsing step, that's not a theoretical risk.
`exceljs` reads the same OOXML format without those advisories.

**Alternative considered:** Using `xlsx` anyway and just being careful
about input size. Rejected - "treat uploaded files as untrusted" is an
explicit assignment requirement, and there's no reason to accept a known,
unpatched vulnerability when an equivalent library exists.

---

### `sanitize-html` allowlist, applied on import *and* on every edit

**What was built:** The same `sanitizeComment()` function
(`src/lib/importer/sanitizeComment.ts`) runs both when a comment is first
imported and every time its text is edited and saved
(`updateCommentFields` in `src/db/repo.ts`).

**Why:** "Sanitize before rendering" is necessary but not sufficient by
itself - if only the render path sanitizes, a bug or a future change to the
render path re-introduces the exact stored-XSS risk sanitizing was
supposed to prevent. Sanitizing at every write means the data at rest is
always already safe, and rendering it is a non-event.

**Result:** A test feeds a comment containing a `javascript:` link, an
inline `<script>`, and an `<img>` tag through the importer and asserts all
three are removed and reported as a warning, while a legitimate `http`
link in the same comment survives untouched.

---

## Hardest import problem

Two candidates, both documented in NOTES.md in detail:

1. **The `Order (w/i item)` column is not a trustworthy global sort key** -
   discovered only by actually checking whether it forms clean 0..n-1
   sequences per group, which it does not in 5 of 115 cases. Handled by
   using row order for the actual `position` and keeping the raw value as
   metadata rather than trying to "fix" or re-derive a canonical order from
   an unreliable field.
2. **The empty `youtube-embed-wrapper` `<div>`** - Spectora's "Export HTML
   Text" format strips embedded video before the file is even produced;
   the wrapper `<div>` (with its responsive-video CSS) survives, but the
   actual `<iframe>` does not. There is no recovery possible on the import
   side - this is genuinely missing from the source, not a parsing gap -
   and it's the clearest concrete example of the missing-vs-unsupported
   distinction the assignment asks for.

## Walkthrough Demo Checklist

1. **Intro** (short). Name, background.
2. **Import on camera**: upload the committed InterNACHI export, show the
   preview (13 sections / 69 items / 392 comments, the duplicate-comment
   warning), click Import, land in the editor.
3. **Edit on camera**: change a comment's text, show the "Saving.../Saved"
   state, refresh the browser, show the edit survived.
4. **Duplicate on camera**: duplicate the template, edit the copy's same
   comment to something different, navigate back to the original, show it
   is unchanged.
5. **Repo walkthrough**: `src/lib/importer/` (parser, no DB dependency),
   `src/db/` (schema + repo + transactions), `src/app/` (Server Actions +
   UI). Mention AGENTS/CLAUDE usage (Claude Code end-to-end).
6. **Data model**: templates/sections/items/comments + `sourceMetadata`
   catch-all + `imports` table for warnings. Explain `position` columns for
   ordering.
7. **Import mapping**: header-driven column resolution, row-order vs.
   `Order (w/i item)` decision, HTML entity decoding vs. HTML sanitization
   distinction.
8. **Preservation check**: show `npm test` passing, specifically point at
   `fixture.test.ts` asserting real counts against the real file.
9. **Decisions / cuts**: point at NOTES.md "What was cut" - answer-type/
   options editing, WYSIWYG, Binsr.
10. **Hardest part**: the `Order` column reliability finding, and the
    YouTube-embed-wrapper missing-content finding.
11. **Failure case on camera**: upload the corrupt-file fixture (or a
    non-.xlsx file), show the clear error, show nothing was written (can
    reference the `imports` table's `failed` row if asked).
12. **Hive feedback**: the Comment Type -> Hive category mapping
    observation from NOTES.md.
