import { z } from "zod";

/**
 * Schema for a single product line as extracted from a scanned invoice.
 * `confidence` should be low for handwritten fields the model is unsure
 * about — this feeds the REVIEW queue alongside math validation.
 */
export const ExtractedLineItemSchema = z.object({
  productName: z.string().min(1),
  retailPrice: z.number().nonnegative(),
  unitCost: z.number().nonnegative(),
  deliveredQuantity: z.number().int(),
  returnedQuantity: z.number().int(),
  confidence: z.number().min(0).max(1).default(1),
});

export const ExtractedInvoiceSchema = z.object({
  invoiceDate: z.string(), // ISO date string; parsed/validated at the DB boundary
  invoiceNumber: z.string().min(1),
  storeNumber: z.string().min(1),
  storeName: z.string().min(1),
  storeAddress: z.string().optional(),
  products: z.array(ExtractedLineItemSchema).min(1),
  totalCharges: z.number(),
  totalCredit: z.number(),
  totalAmountDue: z.number(),
});

export type ExtractedLineItem = z.infer<typeof ExtractedLineItemSchema>;
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;

/**
 * Every AI vision provider must implement this. The rest of the app
 * (validation, DB persistence, UI) depends only on this interface, never
 * on a specific provider's SDK or response shape.
 */
export interface InvoiceExtractor {
  /** Human-readable provider name, stored on ExtractionAttempt rows. */
  readonly providerName: string;

  /**
   * Extract structured invoice data from a single invoice page. `mimeType`
   * is usually an image type, but may be "application/pdf" — in that case
   * `fileBuffer` is a single-page PDF (see lib/pdf/splitPages.ts), not an
   * image. Implementations MUST validate their raw response against
   * ExtractedInvoiceSchema before returning, and should throw a
   * descriptive error (not return malformed data) on failure.
   */
  extractInvoice(fileBuffer: Buffer, mimeType: string): Promise<ExtractedInvoice>;
}

/** Thrown when a provider's raw response fails schema validation. */
export class ExtractionValidationError extends Error {
  constructor(
    message: string,
    public readonly rawResponse: unknown,
    public readonly zodError: z.ZodError
  ) {
    super(message);
    this.name = "ExtractionValidationError";
  }
}
