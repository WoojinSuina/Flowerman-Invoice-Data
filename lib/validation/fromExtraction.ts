import { dollarsToCents } from "../money";
import type { ExtractedInvoice } from "../extraction/types";
import type { InvoiceValidationInput } from "./engine";

/**
 * The ONLY place an ExtractedInvoice (dollars, from AI/human input) is
 * converted into the cents-based shape the validation engine consumes.
 */
export function toValidationInput(extracted: ExtractedInvoice): InvoiceValidationInput {
  return {
    invoiceTotalChargesCents: dollarsToCents(extracted.totalCharges),
    invoiceTotalCreditCents: dollarsToCents(extracted.totalCredit),
    invoiceTotalAmountDueCents: dollarsToCents(extracted.totalAmountDue),
    items: extracted.products.map((p) => ({
      productName: p.productName,
      unitCostCents: dollarsToCents(p.unitCost),
      deliveredQuantity: p.deliveredQuantity,
      returnedQuantity: p.returnedQuantity,
    })),
  };
}
