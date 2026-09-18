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

## What's NOT built yet (by design — see Phases below)

- Multi-page PDF splitting and batch job processing (§9, Phase 3)
- Dashboard, Stores, Products analytics screens (Phase 4)
- Delivery recommendations (Phase 5)
- Auth middleware (a stub is planned but not wired up — the Review UI is
  currently unauthenticated)
- Adding/removing line items during review (corrections only edit existing
  items by id)

The next milestone is Phase 3 (multi-page PDF splitting and batch
processing), since Phase 2 assumes one invoice image per upload.

## Setup

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
| `AUTH_SECRET` | Yes (Phase 1 auth) | any random string, e.g. `openssl rand -hex 32` |

## Local development

```bash
npm run dev
```

Test the Phase 1 pipeline directly:

```bash
curl -X POST http://localhost:3000/api/invoices/upload \
  -F "file=@/path/to/one_invoice_page.jpg"
```

Response includes the extracted data, calculated totals, PASS/REVIEW
status, and (if REVIEW) quantity-error suggestions.

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
- **Async processing (Phase 3)**: for the MVP's expected volume (~100
  pages/week), a simple in-process queue (e.g. sequential processing with
  a `ProcessingJob` progress row polled by the client) is sufficient — no
  need for Redis/BullMQ yet. Revisit if volume grows to the point where a
  single server process can't keep up or you need retry/backoff semantics
  beyond a try/catch loop.
