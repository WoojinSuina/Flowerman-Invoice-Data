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
- `app/dashboard` — KPI tiles (total invoices, total revenue, needs
  review, approved) plus Top Stores and Top Products tables. No charting
  library yet — tiles and tables only, by design; a natural place to add
  real charts later.
- `app/stores` / `app/stores/[id]` — store list with invoice
  count/revenue, and a per-store invoice history linking into
  `/review/[id]`.
- `app/products` — per-product totals (quantity sold, revenue, times
  seen, average AI confidence) — the confidence column doubles as a
  quality signal for which products the model struggles to read.
- `components/NavBar.tsx` — shared nav (Dashboard/Review/Jobs/Stores/
  Products + logout), replacing the ad-hoc header links each page used
  to hand-roll. `/` now redirects straight to `/dashboard`.

## What's NOT built yet (by design — see Phases below)

- Delivery recommendations (Phase 5)
- Adding/removing line items during review (corrections only edit existing
  items by id)
- Async/polled batch processing — uploads are currently synchronous (see
  "Architectural notes" below for why, and when to revisit)
- Charts on the Dashboard — currently KPI tiles + tables only

The next milestone is Phase 5 (delivery recommendations).

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
| `DATABASE_URL` | Yes | Supabase → Project Settings → Database → Connection string |
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

- **Currency**: everything is integer cents (`lib/money.ts`). Never compare
  floats for money.
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
