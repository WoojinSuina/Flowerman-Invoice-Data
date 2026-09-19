# FLOWER MAN

Turns scanned flower-delivery invoices into a validated, structured database.
Philosophy: **AI proposes. Math verifies. Humans resolve exceptions.**

## What's built (Phase 1)

- `prisma/schema.prisma` — full normalized schema (stores, invoices, items,
  products, extraction attempts, manual corrections, processing jobs, audit
  log). All money stored as integer cents.
- `lib/validation/engine.ts` — the deterministic validation engine. **No
  dependency on AI or the database.** 13 unit tests in `engine.test.ts`
  covering perfect matches, one- and multi-unit handwriting errors, zero
  returns, all-returned, rounding at the $0.01 tolerance boundary,
  impossible quantities (returned > delivered, negatives), and
  unexplained differences.
- `lib/extraction/types.ts` — the `InvoiceExtractor` interface and Zod
  schema every provider must satisfy.
- `lib/extraction/providers/claude.ts` — first implementation, using
  Claude's vision API.
- `app/api/invoices/upload/route.ts` — Phase 1 endpoint: one invoice image
  in, extraction + validation + DB persistence out.

## What's built (Phase 2)

- `lib/storage/supabase.ts` — uploads the scanned invoice image to Supabase
  Storage at ingest time; the public URL is saved on `Invoice.sourceImageUrl`.
- `lib/validation/diffCorrections.ts` — pure diffing of original vs.
  reviewer-corrected fields into `ManualCorrection` rows. Same
  no-DB/no-framework isolation as `engine.ts`.
- `app/api/invoices/route.ts` / `[id]/route.ts` — list (filterable by
  `validationStatus`) and fetch a single invoice with items + corrections.
- `app/api/invoices/[id]/corrections/route.ts` — server re-validates and
  persists reviewer corrections, writing an audit trail.
- `app/api/invoices/[id]/approve/route.ts` — marks an invoice `APPROVED`
  (any status can be approved — no gating).
- `app/review` — invoice queue (filterable by status) and a per-invoice
  split-screen review page (`app/review/[id]`, `InvoiceReviewForm`):
  scanned image alongside editable fields, live PASS/REVIEW recalculation
  as you type (via `validateInvoice`, no server round-trip), Save and
  Approve actions.
- **Auto-approval for exact reconciliations**: `processInvoicePage.ts`
  marks an invoice `APPROVED` directly (skipping the manual Approve click)
  when it's `PASS` *and* `validationDifferenceCents` is exactly 0 — a
  PASS within the $0.01 tolerance still requires a human look, only a
  perfect match doesn't. Still writes an `AuditLog` row (`actor: "system"`,
  `action: "auto-approved"`) so the trail shows nothing was skipped
  silently. 17 pre-existing PASS invoices with a $0.00 difference were
  backfilled to `APPROVED` the same way, one time, by hand.
- **Duplicate-scan detection, two layers**: `Invoice` has a unique
  constraint on `(invoiceNumber, storeId)` — an exact re-scan (same number
  re-read the same way) is rejected outright, now with a human-readable
  error (`An invoice numbered X already exists for this store — likely a
  duplicate scan`) instead of the raw Prisma constraint message. That
  constraint can't catch a re-scan that OCR reads slightly differently
  though, so `processInvoicePage.ts` also checks every other invoice at the
  same store on the same date and flags one as a possible duplicate if it
  matches on **either** the total amount due **or** the exact set of line
  items (product, delivered, returned, unit cost) — matching on items too
  catches a re-scan where OCR misread the total differently between the two
  reads but got the same products/quantities both times. A hit sets
  `Invoice.possibleDuplicateOfId` (plain id, no relation, looked up manually
  — same pattern as other cross-model joins in this app) and forces `REVIEW`
  even if the math otherwise reconciled, since a possible duplicate is
  exactly the kind of exception a human needs to resolve. There's no
  delete/merge action for confirmed duplicates yet — the human resolves it
  by editing one of the two, the same as any other REVIEW exception.
- **Failed pages, and possible duplicates, show both scans side by side.**
  `ExtractionAttempt.sourceImageUrl` is set whenever a page's file made it to
  Supabase Storage before something later failed (e.g. the duplicate-scan
  rejection above) — extraction/upload failures never reach that point, so
  it stays null for those, correctly, since there's no file to show. A hard
  duplicate also sets `ExtractionAttempt.duplicateOfInvoiceId`, pointing at
  the invoice it collided with (plain id, no relation). `/jobs/[id]`'s
  "Failed pages" table and `InvoiceReviewForm`'s possible-duplicate banner
  both render the current scan next to the existing one (via the same
  `PdfPageImage` component) so a duplicate can be visually confirmed against
  the actual scans instead of just an error string or invoice number.
- **Upload merged into Jobs.** `/upload` was a separate page whose only
  purpose was feeding the same `ProcessingJob` list shown on `/jobs` — now
  `UploadForm` renders at the top of `/jobs` itself, so upload progress and
  batch history are on one page. `/upload` still resolves (redirects to
  `/jobs`) rather than 404ing in case anything linked to it, and the
  `NavBar` Upload entry is gone. `UploadQueueProvider` also calls
  `router.refresh()` after each file in the queue finishes, so a new job
  appears in the table live if you're sitting on this page while a batch
  runs, instead of only after a manual reload.
- **Impossible (future) invoice dates force REVIEW.** A delivery can't be
  dated after today — that's a hard fact, not a heuristic — but a
  hard-to-read scan can still get its month/day swapped by the model
  (confirmed on a real case: `0?/12/26` printed, with the month digit
  faded/illegible, extracted as December instead of month `0?`, day 12).
  `lib/dates.ts` exports `isFutureDate()`; `processInvoicePage.ts` forces
  `REVIEW` (and blocks auto-approval) whenever the extracted date is after
  today, the same way a possible duplicate does. `invoiceDate` is now an
  editable field in `InvoiceReviewForm` (previously the only editable
  fields were totals and line items) with a banner explaining the problem,
  so once flagged, a human can actually fix it — the corrections endpoint
  re-checks `isFutureDate()` on save and re-applies `REVIEW` if the
  corrected date is still in the future. No migration needed since
  `invoiceDate` already existed; this only changes when/how it can be
  edited and what forces review.
- **Database connection: split pooled vs. direct URL.** `DATABASE_URL` was
  pointed at Supabase's session-mode pooler (port 5432), which hard-caps at
  15 connections *project-wide* — ordinary concurrent queries during a
  batch upload (Prisma's own client already opens several connections, and
  `processInvoicePage.ts` used to upsert every distinct product on an
  invoice concurrently, one connection each) exhausted it in practice,
  surfacing as `FATAL: (EMAXCONNSESSION) max clients reached in session
  mode`. `DATABASE_URL` now points at the transaction-mode pooler (port
  6543, `?pgbouncer=true`) instead, which multiplexes many short queries
  over a small number of real connections; a new `DIRECT_URL` (session-mode,
  the old value) is used only by `prisma migrate`, since advisory locks and
  other session-level features aren't available through a transaction
  pooler. The per-invoice product upserts are also now sequential instead
  of `Promise.all`, so a single invoice can no longer burst many
  connections at once regardless of which pooler is in front.
- **Retry a single failed page without hunting for it.** A failed page's
  file is already sitting in Storage (see `sourceImageUrl` above) — the
  Jobs detail page's "Failed pages" table now has a "Retry this page"
  button (`RetryFailedPageButton`) that fetches that exact file back and
  drops it into the same upload queue as everything else
  (`UploadQueueProvider` gained a single-file `addFile()` alongside the
  existing `addFiles()`), instead of asking the user to relocate and
  re-select the original file from a batch of hundreds.

## What's built (Phase 3)

- `lib/pdf/splitPages.ts` — splits a multi-page PDF into single-page PDFs
  with `pdf-lib` (pure JS, no native/canvas dependency). Unit tested with
  in-memory generated fixture PDFs.
- `lib/extraction/providers/claude.ts` — now sends PDF pages to Claude as a
  `document` content block directly (no rasterization needed).
- `lib/invoices/processInvoicePage.ts` — the shared "one page's bytes in,
  one persisted Invoice out" logic, reused by every page of a batch (and by
  a plain single-image upload, now handled as a batch of one). Every
  failure mode (extraction, storage, DB write) is caught per-page and
  logged as an audit-trail `ExtractionAttempt` rather than aborting the
  whole batch.
- `app/api/invoices/upload/route.ts` — now accepts `application/pdf` in
  addition to images. Every upload creates a `ProcessingJob`, splits PDFs
  into pages, and processes them sequentially, updating job progress as it
  goes. Response shape is now `{ job, results[] }` (was `{ invoice,
  validation }` in Phase 1/2).
- `app/api/jobs/route.ts` / `[id]/route.ts` and `app/jobs` — batch job
  queue and detail view (which invoices a batch produced, and which pages
  failed and why).
- `InvoiceReviewForm` now renders PDF-sourced pages via a native `<iframe>`
  instead of `<img>`.

## What's built (Auth)

- `proxy.ts` — a single shared-secret gate (`AUTH_SECRET`) in front of
  every route except `/login` and `POST /api/login`: pages redirect to
  `/login`, API routes get a `401`. Named `proxy.ts`, not `middleware.ts`
  — Next.js 16 renamed the convention (the old name still works during a
  deprecation window, but the new one avoids a build warning).
- `app/login/page.tsx` + `app/api/login/route.ts` — a password form that
  sets a long-lived (1 year), `httpOnly` cookie on success. The cookie is
  marked `Secure` in production, so it requires HTTPS there (works fine
  over plain HTTP in local dev, where `NODE_ENV=development`).
- `app/api/logout/route.ts` + `components/LogoutButton.tsx` — clears the
  cookie.
- There's one shared password for the whole family, not per-user accounts
  — sufficient for this app's threat model (keep strangers out), not a
  general-purpose auth system.

## What's built (Framework upgrade)

Upgraded from Next.js 14.2.15 to **16.3.5** (React 18 → 19) to fix a batch
of CVEs `npm audit` flagged in 14.x, which is EOL and receives no further
security patches. Notable side effects:
- `npm run build`/`npm run dev` pass `--webpack` — Turbopack is now the
  default in Next 16, but this machine's Application Control policy blocks
  the native SWC binary Turbopack needs, so builds fall back to Webpack
  (with WASM-based SWC, which is slower but fully functional). Revisit if
  this ever runs on a machine without that restriction.
- `npm run lint` now runs ESLint directly via `eslint.config.mjs` (flat
  config) instead of the removed `next lint` command.
- `AGENTS.md`/`CLAUDE.md` at the repo root are auto-generated by `next dev`
  to warn AI coding assistants that the framework has changed significantly
  since most models' training data — commit them as-is when they change,
  per their own header comment, rather than deleting them.

## What's built (Phase 4)

- `lib/invoices/processInvoicePage.ts` now upserts a `Product` row per
  distinct product name (same pattern as the existing `Store` upsert) and
  links every `InvoiceItem.productId` — the `Product` table existed since
  Phase 1 but was never populated until now. Existing rows were backfilled
  one time by hand; any future gap (e.g. after a manual DB edit) would need
  the same treatment — there's no ongoing migration for this, just the
  going-forward upsert on every new upload.
- Product name matching is exact-string, so an OCR misread (e.g. "TS ROSE"
  read as "1S ROSE" on one invoice) creates a second `Product` row instead
  of merging into the existing one. Rather than automatic fuzzy matching
  (risks wrongly merging genuinely different products with similar names),
  `app/api/products/merge/route.ts` + `MergeProductButton` on `/products`
  let you manually merge a duplicate into the correct product — reassigns
  every `InvoiceItem` and deletes the duplicate `Product` row.
- Dashboard/Products aggregates include invoices of every
  `validationStatus`, not just `APPROVED` — a REVIEW-status invoice with an
  uncorrected AI misread (e.g. an "impossible quantity" flag) will skew
  the numbers until a human corrects it. Worth revisiting (e.g. restrict
  to `APPROVED` only) if this becomes noticeable at higher volume.
- `app/dashboard` — KPI tiles (total invoices, potential revenue, total
  revenue, needs review, approved), Top Stores and Top Products tables,
  and a Revenue by week table (Sunday-start weeks, computed in JS from
  `Invoice.invoiceDate` — no charting library yet, tiles and tables only,
  by design; a natural place to add a real chart later).
- **A store's identity is (name, address) together, not its printed store
  number.** `resolveStore()` in `lib/invoices/processInvoicePage.ts` matches
  an incoming invoice to an existing `Store` by the `(name, address)`
  compound key first (falling back to `storeNumber` only when no address
  was extracted at all). The printed number is unreliable — it's just
  informational now, not the dedup key — and different real locations of
  the same chain (e.g. 18 different Shell stations across the invoices
  actually processed) would otherwise be impossible to distinguish if
  grouped by name/number alone. Address alone isn't always enough either:
  some invoices print no separate street address, just a compact
  "brand + road + town" description, and two different real stores can end
  up with the same short trailing address (e.g. both just the town name) —
  including name in the key fixes that. `@@unique([name, address])` on
  `Store`; `storeNumber` is not unique.
- **A one-time repair was needed** after this fix shipped: 44 of the 126
  invoices that existed before it were still attached to the wrong store
  (merged under a shared, unreliable store number from before the fix).
  Repaired by re-resolving every invoice against its own already-recorded
  address (free — no API calls) except 6 whose recorded address was the
  vendor's (from before the separate vendor-vs-store prompt fix), which
  needed one fresh re-extraction each. There's no ongoing tool for this —
  it was a one-off migration for existing bad data, run by hand.
- Same OCR-duplicate risk as products: `app/api/stores/merge/route.ts` +
  `MergeStoreButton` on `/stores` let you manually merge two store rows
  that turn out to be the same real location under slightly different
  extracted address text — reassigns every `Invoice` and deletes the
  duplicate `Store` row.
- `app/stores` / `app/stores/[id]` — store list with invoice
  count/revenue, and a per-store invoice history linking into
  `/review/[id]`.
- `app/products` — per-product totals (quantity sold, revenue, times
  seen, average AI confidence) — the confidence column doubles as a
  quality signal for which products the model struggles to read.
- `components/NavBar.tsx` — shared nav (Dashboard/Review/Jobs/Stores/
  Products + logout), replacing the ad-hoc header links each page used
  to hand-roll. `/` now redirects straight to `/dashboard`.

## What's built (Phase 5)

- `app/recommendations` — one suggested delivery quantity per store per
  product: an average `soldQuantity`, rounded to the nearest whole unit.
  Transparent by design (the README's own "not ML" goal for this phase) —
  average delivered and average returned are shown alongside every
  suggestion so the math behind the number is visible, not just the
  output.
- **Seasonal, layered fallback, not a flat all-time average**: flower
  demand swings by month (holidays, weather), so averaging across every
  month ever recorded would flatten those swings out. For each store+
  product, the average is computed from that store+product's invoices in
  the *same calendar month in a prior year* if any exist; otherwise it
  falls back to the last 3 invoices (any month) so the number still
  tracks recent demand instead of a stale yearly blend. The "Based on"
  column always names which basis was used (e.g. "September (2025)" vs.
  "last 3 invoices"). Every pair falls back to the recent-invoices case
  today — the app only has a few months of history, not a full prior
  year yet — but the same-month branch activates automatically once
  there's more than a year of data, with no code change needed.
- Unlike the Dashboard/Products aggregates, this query **only** counts
  `PASS`/`APPROVED` invoices, excluding `REVIEW`. A recommendation directly
  drives how much product gets ordered, so letting an uncorrected AI
  misread (e.g. a REVIEW-flagged "returned > delivered" line) skew it is a
  worse failure mode here than on a read-only KPI tile — confirmed by
  hitting exactly this during testing (a REVIEW invoice with
  returned > delivered produced a negative suggested quantity before this
  filter was added). A `Math.max(0, ...)` clamp on the rounded result is
  kept as a second line of defense.
- No history-length threshold — a store/product pair backed by a single
  invoice gets a suggestion just like one backed by twenty; the "Based on"
  column makes the confidence (and which basis was used) visible instead
  of hiding low-data pairs.
- **Stores that only have REVIEW invoices are still listed**, not hidden.
  Since the recommendation query excludes REVIEW invoices, a store whose
  only invoice needs review would otherwise have zero data and vanish from
  the page entirely — easy to mistake for "this store has no history" when
  it actually means "go review that invoice first." The sidebar shows a
  "N need review" badge on any store with pending REVIEW invoices (whether
  or not it also has recommendation data), linking to `/stores/[id]`; a
  store with only REVIEW invoices shows that badge plus an explanation
  instead of an empty table.

## What's NOT built yet (by design — see Phases below)

- Adding/removing line items during review (corrections only edit existing
  items by id)
- Async/polled batch processing — uploads are currently synchronous (see
  "Architectural notes" below for why, and when to revisit)
- Charts on the Dashboard — currently KPI tiles + tables only

## Setup

Requires **Node.js 20.9.0+** (Next.js 16's minimum).

```bash
npm install
cp .env.example .env      # fill in all variables below
# In the Supabase dashboard: Storage -> create a bucket named "invoice-scans", set it Public
npx prisma migrate dev --name init
npm run db:generate
```

### Environment variables

| Variable | Required | Source |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase → Project Settings → Database → Connection string → **Transaction** pooler (port 6543); append `?pgbouncer=true` |
| `DIRECT_URL` | Yes | Same page → **Session** pooler (port 5432) connection string. Used only by `prisma migrate` — the transaction pooler above doesn't support the session-level features migrations need. |
| `ANTHROPIC_API_KEY` | Yes | console.anthropic.com |
| `SUPABASE_URL` | Yes (Phase 2) | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (Phase 2) | Supabase → Project Settings → API → `service_role` secret |
| `SUPABASE_BUCKET` | Yes (Phase 2) | Name of a **public** Storage bucket you create, e.g. `invoice-scans` |
| `AUTH_SECRET` | Yes | The shared family login password (also used as the session cookie value). Any string, e.g. `openssl rand -hex 32`. |

## Local development

```bash
npm run dev
```

Open `/upload` in the browser to upload invoices through the UI (a single
image, or a multi-page PDF — split and processed one page per invoice
automatically). Or hit the endpoint directly:

```bash
curl -X POST http://localhost:3000/api/invoices/upload \
  -F "file=@/path/to/invoices.pdf"
```

Response is `{ job, results[] }` — `job` is the `ProcessingJob` row
(progress/pass/review/failed counts), `results[]` has one entry per page:
either `{ sourcePage, invoice, validation }` on success or `{ sourcePage,
error }` on failure. A single-image upload is just a batch of one.

## Testing

The validation engine can be tested without any dependencies installed
(no DB, no API key, no network):

```bash
npm test
```

## Deployment

Target: Vercel (Next.js) + Supabase (Postgres). Set the same environment
variables in the Vercel project settings. Run `prisma migrate deploy`
against production `DATABASE_URL` as part of your deploy step.

## Development Phases

1. **Phase 1 (this delivery)** — schema, single-invoice-image upload,
   extraction, validation engine, PASS/REVIEW.
2. **Phase 2** — Review UI: split-screen (scanned image / editable
   fields), live recalculation, approve, audit trail of corrections.
3. **Phase 3** — Multi-page PDF splitting, batch processing, job status,
   review queue screen.
4. **Phase 4** — Dashboard, Stores, Products analytics.
5. **Phase 5** — Delivery recommendations (transparent stats, not ML).

## Architectural notes

- **`next.config.ts`**: sets `experimental.proxyClientMaxBodySize: "25mb"`.
  Next.js buffers every request body passing through `proxy.ts` (needed
  there to check the auth cookie) up to a default of 10MB, silently
  truncating anything larger — which corrupts a multipart upload and
  crashes `request.formData()` with an opaque error. Keep this above
  `MAX_FILE_BYTES` in `app/api/invoices/upload/route.ts` (currently 20MB).
- **Currency**: everything is integer cents (`lib/money.ts`). Never compare
  floats for money.
- **Extraction prompt fixes are cumulative, not automatically applied to
  history**: `lib/extraction/providers/claude.ts`'s `EXTRACTION_PROMPT` has
  needed real fixes as more invoices came through (e.g. distinguishing the
  vendor's letterhead from the destination store's "NAME" line; the printed
  date being MM/DD/YY, which the model initially misread as a 4-digit year
  from the leading "08"). Each fix only affects future uploads — existing
  bad rows need a one-off re-extraction pass from their `sourceImageUrl`,
  the same way the store-name and date bugs were corrected by hand. There's
  no general "re-run extraction on everything" tool; if this keeps
  happening, building one would be worthwhile.
- **Provider independence**: `lib/validation/engine.ts` imports nothing
  from `lib/extraction/`. Swapping AI providers means writing a new class
  satisfying `InvoiceExtractor` — validation logic is untouched.
- **Auditability**: `rawExtraction` on `Invoice` and the `extraction_attempts`
  table preserve what the AI originally said, forever. `manual_corrections`
  records every human edit with original/corrected/timestamp. Nothing is
  overwritten.
- **Batch processing is synchronous (Phase 3)**: a PDF upload splits and
  processes every page sequentially within the same HTTP request, only
  returning once the whole batch is done. This is deliberately simple and
  fine for local/self-hosted use at the MVP's expected volume (~100
  pages/week). **Revisit before deploying to Vercel** — a large batch (many
  pages, each a multi-second Claude call) can exceed serverless function
  duration limits. The fix, when needed, is exactly what was originally
  anticipated here: move the loop off the request thread and have the
  client poll the `ProcessingJob` row for progress — no Redis/BullMQ
  required at this volume, just moving where the loop runs.
- **`document`-block type gap**: `lib/extraction/providers/claude.ts` casts
  around a TypeScript type gap in the pinned `@anthropic-ai/sdk@^0.32.0`
  (it predates the SDK's `document` content-block type; the API itself
  accepts it fine, no beta header needed). Revisit the cast if/when the SDK
  is upgraded for other reasons.
