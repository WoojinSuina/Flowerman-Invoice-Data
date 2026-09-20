/**
 * VALIDATION ENGINE
 *
 * This module has NO dependency on the extraction/ or db/ layers, and no
 * dependency on any AI provider. It is pure, deterministic, and 100%
 * unit-testable in isolation. This isolation is intentional: it is the
 * trust boundary between "what the AI thinks it saw" and "what the numbers
 * actually say."
 *
 * Philosophy (spec §21): AI proposes. Math verifies. Humans resolve
 * exceptions. This file is the "math verifies" step.
 */

import { CURRENCY_TOLERANCE_CENTS, formatCents } from "../money.ts";

export interface LineItemInput {
  productName: string;
  unitCostCents: number;
  deliveredQuantity: number;
  returnedQuantity: number;
}

export interface InvoiceValidationInput {
  invoiceTotalChargesCents: number;
  invoiceTotalCreditCents: number;
  invoiceTotalAmountDueCents: number;
  items: LineItemInput[];
}

export interface LineItemResult extends LineItemInput {
  soldQuantity: number;
  deliveredAmountCents: number;
  returnCreditCents: number;
  netSoldAmountCents: number;
  /**
   * true if either quantity is negative, or returnedQuantity >
   * deliveredQuantity and that's not allowed for this invoice (see
   * validateLineItem's allowReturnsExceedingDelivered).
   */
  hasImpossibleQuantity: boolean;
}

export type ValidationStatus = "PASS" | "REVIEW";

export interface ErrorSuggestion {
  message: string;
  productName: string;
  possibleQuantityError: number;
}

export interface InvoiceValidationResult {
  status: ValidationStatus;
  items: LineItemResult[];
  calculatedTotalChargesCents: number;
  calculatedTotalCreditCents: number;
  calculatedAmountDueCents: number;
  invoiceTotalAmountDueCents: number;
  differenceCents: number; // invoice - calculated
  internalConsistencyOk: boolean; // charges - credit == amountDue, on the invoice's own printed numbers
  suggestions: ErrorSuggestion[];
}

/**
 * Validate a single line item's arithmetic and flag physically impossible
 * quantities (e.g. returned > delivered, negative values). This never
 * throws — impossible data is a REVIEW condition, not a crash.
 *
 * `allowReturnsExceedingDelivered` (consignment stores only): a return can
 * credit stock delivered in a PRIOR cycle, so a product showing 0 (or a
 * small number) delivered this cycle but a nonzero return is expected, not
 * impossible — soldQuantity/netSoldAmountCents simply go negative for that
 * line, correctly reducing the calculated total. Negative delivered/returned
 * values are still always impossible, consignment or not.
 */
export function validateLineItem(
  item: LineItemInput,
  options?: { allowReturnsExceedingDelivered?: boolean }
): LineItemResult {
  const returnsExceedDelivered = item.returnedQuantity > item.deliveredQuantity;
  const hasImpossibleQuantity =
    item.deliveredQuantity < 0 ||
    item.returnedQuantity < 0 ||
    (returnsExceedDelivered && !options?.allowReturnsExceedingDelivered);

  const soldQuantity = item.deliveredQuantity - item.returnedQuantity;

  return {
    ...item,
    soldQuantity,
    deliveredAmountCents: item.deliveredQuantity * item.unitCostCents,
    returnCreditCents: item.returnedQuantity * item.unitCostCents,
    netSoldAmountCents: soldQuantity * item.unitCostCents,
    hasImpossibleQuantity,
  };
}

/**
 * Given a difference between invoice and calculated totals, try to explain
 * it as a small integer quantity error on one product (§4). This is a
 * SUGGESTION only — it must never be auto-applied.
 */
export function suggestQuantityErrors(
  differenceCents: number,
  items: LineItemInput[],
  maxMultiple = 5
): ErrorSuggestion[] {
  const suggestions: ErrorSuggestion[] = [];
  const absDiff = Math.abs(differenceCents);
  if (absDiff === 0) return suggestions;

  for (const item of items) {
    if (item.unitCostCents <= 0) continue;
    if (absDiff % item.unitCostCents !== 0) continue;

    const multiple = absDiff / item.unitCostCents;
    if (multiple < 1 || multiple > maxMultiple) continue;

    const direction = differenceCents > 0 ? "under-counted" : "over-counted";
    suggestions.push({
      productName: item.productName,
      possibleQuantityError: multiple,
      message:
        `Possible error: returned quantity for "${item.productName}" may be ` +
        `off by ${multiple} (${direction} relative to the invoice total by ` +
        `${formatCents(absDiff)}, which equals ${multiple} × ${formatCents(item.unitCostCents)}).`,
    });
  }

  return suggestions;
}

/**
 * Validate a full invoice: per-line math, invoice-level totals, and
 * internal consistency of the invoice's own printed numbers.
 *
 * `allowReturnsExceedingDelivered` (pass `true` for a consignment store —
 * see validateLineItem): only relaxes the per-item impossible-quantity
 * check. The written total must still equal the calculated total, and the
 * invoice's own printed numbers must still be internally consistent — a
 * consignment invoice's total is not exempt from reconciling, only its
 * per-item return/delivered relationship is.
 */
export function validateInvoice(
  input: InvoiceValidationInput,
  options?: { allowReturnsExceedingDelivered?: boolean }
): InvoiceValidationResult {
  const items = input.items.map((item) => validateLineItem(item, options));

  const calculatedTotalChargesCents = items.reduce((sum, i) => sum + i.deliveredAmountCents, 0);
  const calculatedTotalCreditCents = items.reduce((sum, i) => sum + i.returnCreditCents, 0);
  const calculatedAmountDueCents = items.reduce((sum, i) => sum + i.netSoldAmountCents, 0);

  const differenceCents = input.invoiceTotalAmountDueCents - calculatedAmountDueCents;

  const internalConsistencyOk =
    Math.abs(
      input.invoiceTotalChargesCents -
        input.invoiceTotalCreditCents -
        input.invoiceTotalAmountDueCents
    ) <= CURRENCY_TOLERANCE_CENTS;

  const anyImpossibleQuantity = items.some((i) => i.hasImpossibleQuantity);

  const withinTolerance = Math.abs(differenceCents) <= CURRENCY_TOLERANCE_CENTS;

  const status: ValidationStatus =
    withinTolerance && internalConsistencyOk && !anyImpossibleQuantity ? "PASS" : "REVIEW";

  const suggestions =
    status === "REVIEW" ? suggestQuantityErrors(differenceCents, input.items) : [];

  return {
    status,
    items,
    calculatedTotalChargesCents,
    calculatedTotalCreditCents,
    calculatedAmountDueCents,
    invoiceTotalAmountDueCents: input.invoiceTotalAmountDueCents,
    differenceCents,
    internalConsistencyOk,
    suggestions,
  };
}
