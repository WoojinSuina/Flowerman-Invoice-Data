import { dollarsToCents } from "../money.ts";
import type { ExtractedInvoice } from "../extraction/types.ts";
import type { InvoiceValidationInput } from "./engine.ts";

/**
 * If nothing was written in the credit/returns section and no total-due
 * was written either, that means nothing was returned: everything
 * delivered was sold, so the (unwritten) total due is simply the total
 * charges. Without this, a blank bottom section reads as totalAmountDue =
 * $0.00, which validation would then compare against the calculated total
 * and wrongly flag as a huge discrepancy. Only ever raises totalAmountDue
 * to match totalCharges — if there turn out to be real per-item returns
 * despite the blank summary, the math still won't reconcile and this still
 * correctly falls through to REVIEW.
 */
export function inferBlankTotalAmountDue(extracted: ExtractedInvoice): ExtractedInvoice {
  if (extracted.totalCredit === 0 && extracted.totalAmountDue === 0 && extracted.totalCharges > 0) {
    return { ...extracted, totalAmountDue: extracted.totalCharges };
  }
  return extracted;
}

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
