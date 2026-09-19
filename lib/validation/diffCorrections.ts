/**
 * Diffs original vs. reviewer-corrected values to produce ManualCorrection
 * rows. No DB/framework dependency — same isolation as engine.ts. Values
 * are stored as strings of the underlying cents/int representation, never
 * formatted dollars (§ "everything is cents internally").
 */

export interface FieldDiff {
  fieldPath: string;
  originalValue: string;
  correctedValue: string;
}

export interface InvoiceTotalsShape {
  invoiceTotalChargesCents: number;
  invoiceTotalCreditCents: number;
  invoiceTotalAmountDueCents: number;
}

export interface LineItemShape {
  lineNumber: number;
  productName: string;
  unitCostCents: number;
  deliveredQuantity: number;
  returnedQuantity: number;
}

function diffField(fieldPath: string, original: number, corrected: number): FieldDiff | null {
  if (original === corrected) return null;
  return { fieldPath, originalValue: String(original), correctedValue: String(corrected) };
}

export function diffInvoiceTotals(
  original: InvoiceTotalsShape,
  corrected: InvoiceTotalsShape
): FieldDiff[] {
  const diffs = [
    diffField(
      "invoiceTotalChargesCents",
      original.invoiceTotalChargesCents,
      corrected.invoiceTotalChargesCents
    ),
    diffField(
      "invoiceTotalCreditCents",
      original.invoiceTotalCreditCents,
      corrected.invoiceTotalCreditCents
    ),
    diffField(
      "invoiceTotalAmountDueCents",
      original.invoiceTotalAmountDueCents,
      corrected.invoiceTotalAmountDueCents
    ),
  ];
  return diffs.filter((d): d is FieldDiff => d !== null);
}

export function diffInvoiceDate(original: string, corrected: string): FieldDiff | null {
  if (original === corrected) return null;
  return { fieldPath: "invoiceDate", originalValue: original, correctedValue: corrected };
}

export function diffLineItems(original: LineItemShape[], corrected: LineItemShape[]): FieldDiff[] {
  const correctedByLine = new Map(corrected.map((item) => [item.lineNumber, item]));
  const diffs: FieldDiff[] = [];

  for (const item of original) {
    const updated = correctedByLine.get(item.lineNumber);
    if (!updated) continue;

    const prefix = `items[${item.lineNumber}]`;
    const fieldDiffs = [
      diffField(`${prefix}.unitCostCents`, item.unitCostCents, updated.unitCostCents),
      diffField(
        `${prefix}.deliveredQuantity`,
        item.deliveredQuantity,
        updated.deliveredQuantity
      ),
      diffField(`${prefix}.returnedQuantity`, item.returnedQuantity, updated.returnedQuantity),
    ];
    diffs.push(...fieldDiffs.filter((d): d is FieldDiff => d !== null));

    if (item.productName !== updated.productName) {
      diffs.push({
        fieldPath: `${prefix}.productName`,
        originalValue: item.productName,
        correctedValue: updated.productName,
      });
    }
  }

  return diffs;
}
