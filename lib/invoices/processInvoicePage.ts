import type { Prisma } from "@prisma/client";
import { ClaudeInvoiceExtractor } from "@/lib/extraction/providers/claude";
import { validateInvoice, type InvoiceValidationResult } from "@/lib/validation/engine";
import { toValidationInput } from "@/lib/validation/fromExtraction";
import { prisma } from "@/lib/db/client";
import { dollarsToCents } from "@/lib/money";
import { uploadInvoiceFile } from "@/lib/storage/supabase";

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

    const store = await prisma.store.upsert({
      where: { storeNumber: extracted.storeNumber },
      update: { name: extracted.storeName, address: extracted.storeAddress },
      create: {
        storeNumber: extracted.storeNumber,
        name: extracted.storeName,
        address: extracted.storeAddress,
      },
    });

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
