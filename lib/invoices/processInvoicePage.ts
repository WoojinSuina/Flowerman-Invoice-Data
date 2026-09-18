import type { Prisma, Store } from "@prisma/client";
import { ClaudeInvoiceExtractor } from "@/lib/extraction/providers/claude";
import { validateInvoice, type InvoiceValidationResult } from "@/lib/validation/engine";
import { toValidationInput } from "@/lib/validation/fromExtraction";
import { prisma } from "@/lib/db/client";
import { dollarsToCents } from "@/lib/money";
import { uploadInvoiceFile } from "@/lib/storage/supabase";
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
}

type InvoiceWithItems = Prisma.InvoiceGetPayload<{ include: { items: true } }>;

export type ProcessPageResult =
  | { ok: true; invoice: InvoiceWithItems; validation: InvoiceValidationResult }
  | { ok: false; sourcePage: number; error: string };

/**
 * Turns one page's bytes (an image, or a single-page PDF from
 * lib/pdf/splitPages.ts) into a persisted Invoice: extract, validate,
 * store the file, upsert the Store, create Invoice+Items+ExtractionAttempt.
 * Every failure mode is caught and returned as { ok: false } with an audit
 * trail row — this must never throw, so one bad page in a batch doesn't
 * abort the pages after it.
 */
export async function processInvoicePage(input: ProcessPageInput): Promise<ProcessPageResult> {
  const { buffer, mimeType, sourceFileName, sourcePage, processingJobId } = input;
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

  let uploadedFile;
  try {
    uploadedFile = await uploadInvoiceFile(buffer, mimeType);
  } catch (err) {
    const message = (err as Error).message;
    // Extraction succeeded but storage didn't — still record that the
    // extraction worked (for audit/debugging), just with no Invoice to
    // attach it to.
    await prisma.extractionAttempt.create({
      data: {
        provider: extractor.providerName,
        processingJobId,
        sourcePage,
        rawResponse: extracted as unknown as Prisma.InputJsonValue,
        succeeded: true,
      },
    });
    return { ok: false, sourcePage, error: `Storage upload failed: ${message}` };
  }

  try {
    const validationInput = toValidationInput(extracted);
    const result = validateInvoice(validationInput);

    const store = await resolveStore(extracted);

    const productIdByName = new Map(
      await Promise.all(
        [...new Set(result.items.map((item) => item.productName))].map(async (name) => {
          const product = await prisma.product.upsert({
            where: { name },
            update: {},
            create: { name },
          });
          return [name, product.id] as const;
        })
      )
    );

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
        validationStatus: result.status,
        validationSuggestions: result.suggestions as unknown as Prisma.InputJsonValue,
        rawExtraction: extracted,
        sourceFile: sourceFileName,
        sourcePage,
        sourceImageUrl: uploadedFile.url,
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
            rawResponse: extracted,
            succeeded: true,
          },
        },
      },
      include: { items: true },
    });

    return { ok: true, invoice, validation: result };
  } catch (err) {
    const message = (err as Error).message;
    await prisma.extractionAttempt.create({
      data: {
        provider: extractor.providerName,
        processingJobId,
        sourcePage,
        rawResponse: extracted as unknown as Prisma.InputJsonValue,
        succeeded: false,
        errorMessage: message,
      },
    });
    return { ok: false, sourcePage, error: `Persisting invoice failed: ${message}` };
  }
}
