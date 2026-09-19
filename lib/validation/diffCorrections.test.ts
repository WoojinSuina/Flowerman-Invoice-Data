import { test } from "node:test";
import assert from "node:assert/strict";
import { diffInvoiceTotals, diffInvoiceDate, diffLineItems } from "./diffCorrections.ts";

test("diffInvoiceTotals: no changes -> empty diff", () => {
  const totals = {
    invoiceTotalChargesCents: 1000,
    invoiceTotalCreditCents: 200,
    invoiceTotalAmountDueCents: 800,
  };
  assert.deepEqual(diffInvoiceTotals(totals, { ...totals }), []);
});

test("diffInvoiceTotals: one changed field is reported", () => {
  const original = {
    invoiceTotalChargesCents: 1000,
    invoiceTotalCreditCents: 200,
    invoiceTotalAmountDueCents: 800,
  };
  const corrected = { ...original, invoiceTotalCreditCents: 300 };
  const diffs = diffInvoiceTotals(original, corrected);
  assert.equal(diffs.length, 1);
  assert.deepEqual(diffs[0], {
    fieldPath: "invoiceTotalCreditCents",
    originalValue: "200",
    correctedValue: "300",
  });
});

test("diffLineItems: quantity correction is addressed by lineNumber", () => {
  const original = [
    {
      lineNumber: 0,
      productName: "ROSE",
      unitCostCents: 279,
      deliveredQuantity: 4,
      returnedQuantity: 1,
    },
  ];
  const corrected = [{ ...original[0], returnedQuantity: 2 }];

  const diffs = diffLineItems(original, corrected);
  assert.equal(diffs.length, 1);
  assert.deepEqual(diffs[0], {
    fieldPath: "items[0].returnedQuantity",
    originalValue: "1",
    correctedValue: "2",
  });
});

test("diffLineItems: unmatched lineNumber in corrected set is ignored", () => {
  const original = [
    {
      lineNumber: 0,
      productName: "ROSE",
      unitCostCents: 279,
      deliveredQuantity: 4,
      returnedQuantity: 1,
    },
  ];
  assert.deepEqual(diffLineItems(original, []), []);
});

test("diffInvoiceDate: no change -> null", () => {
  assert.equal(diffInvoiceDate("2026-08-11", "2026-08-11"), null);
});

test("diffInvoiceDate: a corrected date is reported", () => {
  assert.deepEqual(diffInvoiceDate("2026-12-08", "2026-09-08"), {
    fieldPath: "invoiceDate",
    originalValue: "2026-12-08",
    correctedValue: "2026-09-08",
  });
});
