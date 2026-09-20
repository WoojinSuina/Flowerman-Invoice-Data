import { Prisma, type Store } from "@prisma/client";
import { ClaudeInvoiceExtractor } from "@/lib/extraction/providers/claude";
import { validateInvoice, type InvoiceValidationResult } from "@/lib/validation/engine";
import { inferBlankTotalAmountDue, toValidationInput } from "@/lib/validation/fromExtraction";
import { isLikelyDuplicate } from "@/lib/invoices/duplicateDetection";
import { prisma } from "@/lib/db/client";
import { dollarsToCents } from "@/lib/money";
import { isFutureDate } from "@/lib/dates";
import { isConsignmentStore } from "@/lib/stores";
import type { ExtractedInvoice } from "@/lib/extraction/types";

/**
 * A store's identity is (name, address) together, not the printed store
 * number — the number is unreliable (OCR misreads), and different real
 * locations of the same chain can otherwise collide. Address alone isn't
 * always enough either: some invoices print no separate street address,
 * just a compact "brand + road + town" description, and the name/address
 * split can leave two different real stores with the same short trailing
 * address (e.g. both ending up with just the town name). Falls back to
 * matching by number only when no address was extracted at all, so a page
 * with no readable address doesn't spawn a duplicate store on every upload.
 */
async function resolveStore(extracted: ExtractedInvoice): Promise<Store> {
  const address = extracted.storeAddress?.trim() || null;
  const name = extracted.storeName;

  const existing = address
    ? await prisma.store.findUnique({ where: { name_address: { name, address } } })
    : await prisma.store.findFirst({ where: { storeNumber: extracted.storeNumber } });

  if (existing) {
    return prisma.store.update({
      where: { id: existing.id },
      data: { name, address: address ?? existing.address, storeNumber: extracted.storeNumber },
    });
  }

  return prisma.store.create({
    data: { storeNumber: extracted.storeNumber, name, address },
  });
}

export interface ProcessPageInput {
  buffer: Buffer;
  mimeType: string;
  sourceFileName: string;
  sourcePage: number; // 1-based
  processingJobId: string;
  // Already uploaded to Storage by the caller (the fast upload/queueing
  // step) — this function only extracts and persists, it doesn't touch
  // Storage itself. See PendingPage in schema.prisma for why upload and
  // extraction are two separate steps.
  sourceImageUrl: string;
}

type InvoiceWithItems = Prisma.InvoiceGetPayload<{ include: { items: true } }>;

export type ProcessPageResult =
  | { ok: true; invoice: InvoiceWithItems; validation: InvoiceValidationResult }
  | { ok: false; sourcePage: number; error: string };

/**
 * Turns one page's bytes (an image, or a single-page PDF from
 * lib/pdf/splitPages.ts) into a persisted Invoice: extract, validate,
 * upsert the Store, create Invoice+Items+ExtractionAttempt. The file itself
 * is already in Storage by the time this runs (see sourceImageUrl on
 * ProcessPageInput) — this function only extracts and persists.
 * Every failure mode is caught and returned as { ok: false } with an audit
 * trail row — this must never throw, so one bad page in a batch doesn't
 * abort the pages after it.
 */
export async function processInvoicePage(input: ProcessPageInput): Promise<ProcessPageResult> {
  const { buffer, mimeType, sourceFileName, sourcePage, processingJobId, sourceImageUrl } = input;
  const extractor = new ClaudeInvoiceExtractor();

  let extracted;
  try {
    extracted = await extractor.extractInvoice(buffer, mimeType);
  } catch (err) {
    const message = (err as Error).message;
    await prisma.extractionAttempt.create({
      data: {
        provider: extractor.providerName,
        processingJobId,
        sourcePage,
        rawResponse: { error: message },
        succeeded: false,
        errorMessage: message,
      },
    });
    return { ok: false, sourcePage, error: `Extraction failed: ${message}` };
  }

  // Preserve exactly what the AI read, forever, before applying the
  // business-rule correction below — rawExtraction/rawResponse elsewhere
  // in this function always refer back to this, never the corrected value.
  const rawExtraction = extracted;
  extracted = inferBlankTotalAmountDue(extracted);

  let store: Store | undefined;

  try {
    store = await resolveStore(extracted);

    // A return can credit stock delivered in a PRIOR cycle for a
    // consignment store (see isConsignmentStore) — a product showing 0
    // delivered this cycle but a nonzero return isn't impossible, just
    // expected. The written total still has to reconcile with the
    // calculated total either way; only this per-item check relaxes.
    const consignment = isConsignmentStore(store);
    const validationInput = toValidationInput(extracted);
    const result = validateInvoice(validationInput, {
      allowReturnsExceedingDelivered: consignment,
    });

    // Catches a re-scan that OCR reads slightly differently (so the exact
    // invoiceNumber+storeId unique constraint below wouldn't catch it): same
    // store, same date, and either the same total or the same set of line
    // items, but a different invoice number.
    const sameStoreDateCandidates = await prisma.invoice.findMany({
      where: {
        storeId: store.id,
        invoiceDate: new Date(extracted.invoiceDate),
        invoiceNumber: { not: extracted.invoiceNumber },
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalAmountDueCents: true,
        rawExtraction: true,
        items: {
          select: {
            productName: true,
            deliveredQuantity: true,
            returnedQuantity: true,
            unitCostCents: true,
          },
        },
      },
    });
    const possibleDuplicate = sameStoreDateCandidates.find((candidate) =>
      isLikelyDuplicate(
        candidate,
        dollarsToCents(extracted.totalAmountDue),
        result.items,
        extracted.invoiceNumber
      )
    );

    // Sequential, not Promise.all — an invoice with many distinct products
    // used to fire that many concurrent connections at once, which is
    // exactly the kind of burst that exhausts a connection-pooled database.
    const productIdByName = new Map<string, string>();
    for (const name of new Set(result.items.map((item) => item.productName))) {
      const product = await prisma.product.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      productIdByName.set(name, product.id);
    }

    // A delivery invoice can never be dated after today — this is a hard
    // fact, not a heuristic. Almost always a month/day swap on a scan where
    // one digit is faded/illegible (confirmed on a real case: "0?/12/26"
    // read as December instead of month 0?, day 12). Forces REVIEW even if
    // the math otherwise reconciled, same as a possible duplicate.
    const invoiceDateIsFuture = isFutureDate(new Date(extracted.invoiceDate));

    // A PASS with an exact $0.00 difference reconciled perfectly — there's
    // no exception left for a human to resolve, so skip the manual Approve
    // click and go straight to APPROVED (still logged in the audit trail,
    // just with "system" as the actor instead of a person). A possible
    // duplicate or an impossible (future) date always forces REVIEW
    // regardless, since both are exactly the kind of exception a human
    // needs to resolve.
    const autoApproved =
      !possibleDuplicate &&
      !invoiceDateIsFuture &&
      result.status === "PASS" &&
      result.differenceCents === 0;
    const finalStatus = possibleDuplicate || invoiceDateIsFuture ? "REVIEW" : result.status;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: extracted.invoiceNumber,
        invoiceDate: new Date(extracted.invoiceDate),
        storeId: store.id,
        totalChargesCents: dollarsToCents(extracted.totalCharges),
        totalCreditCents: dollarsToCents(extracted.totalCredit),
        totalAmountDueCents: dollarsToCents(extracted.totalAmountDue),
        calculatedTotalChargesCents: result.calculatedTotalChargesCents,
        calculatedTotalCreditCents: result.calculatedTotalCreditCents,
        calculatedAmountDueCents: result.calculatedAmountDueCents,
        validationDifferenceCents: result.differenceCents,
        validationStatus: autoApproved ? "APPROVED" : finalStatus,
        approvedAt: autoApproved ? new Date() : null,
        possibleDuplicateOfId: possibleDuplicate?.id ?? null,
        validationSuggestions: result.suggestions as unknown as Prisma.InputJsonValue,
        rawExtraction,
        sourceFile: sourceFileName,
        sourcePage,
        sourceImageUrl,
        processingJobId,
        items: {
          create: result.items.map((item, index) => ({
            productName: item.productName,
            productId: productIdByName.get(item.productName) ?? null,
            lineNumber: index,
            retailPriceCents: dollarsToCents(
              extracted.products.find((p) => p.productName === item.productName)?.retailPrice ?? 0
            ),
            unitCostCents: item.unitCostCents,
            deliveredQuantity: item.deliveredQuantity,
            returnedQuantity: item.returnedQuantity,
            soldQuantity: item.soldQuantity,
            deliveredAmountCents: item.deliveredAmountCents,
            returnCreditCents: item.returnCreditCents,
            netSoldAmountCents: item.netSoldAmountCents,
            confidence:
              extracted.products.find((p) => p.productName === item.productName)?.confidence ??
              null,
          })),
        },
        extractionAttempts: {
          create: {
            provider: extractor.providerName,
            processingJobId,
            sourcePage,
            rawResponse: rawExtraction,
            succeeded: true,
          },
        },
      },
      include: { items: true },
    });

    if (autoApproved) {
      await prisma.auditLog.create({
        data: {
          entityType: "invoice",
          entityId: invoice.id,
          action: "auto-approved",
          actor: "system",
          detail: { reason: "exact reconciliation, $0.00 difference" },
        },
      });
    }

    return { ok: true, invoice, validation: result };
  } catch (err) {
    const isDuplicateInvoiceNumber =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
    const message = isDuplicateInvoiceNumber
      ? `An invoice numbered ${extracted.invoiceNumber} already exists for this store — likely a duplicate scan.`
      : `Persisting invoice failed: ${(err as Error).message}`;

    const collidingInvoice =
      isDuplicateInvoiceNumber && store
        ? await prisma.invoice.findFirst({
            where: { invoiceNumber: extracted.invoiceNumber, storeId: store.id },
            select: { id: true },
          })
        : null;

    await prisma.extractionAttempt.create({
      data: {
        provider: extractor.providerName,
        processingJobId,
        sourcePage,
        rawResponse: rawExtraction as unknown as Prisma.InputJsonValue,
        succeeded: false,
        errorMessage: message,
        // Always uploaded already at this point (the caller uploads before
        // calling this function), so it's still viewable even though no
        // Invoice was ever created for it.
        sourceImageUrl,
        duplicateOfInvoiceId: collidingInvoice?.id ?? null,
      },
    });
    return { ok: false, sourcePage, error: message };
  }
}
