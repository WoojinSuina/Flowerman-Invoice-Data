import { test } from "node:test";
import assert from "node:assert/strict";
import { inferBlankTotalAmountDue } from "./fromExtraction.ts";
import type { ExtractedInvoice } from "../extraction/types.ts";

function baseInvoice(overrides: Partial<ExtractedInvoice>): ExtractedInvoice {
  return {
    invoiceDate: "2026-01-01",
    invoiceNumber: "1",
    storeNumber: "1",
    storeName: "Store",
    products: [
      {
        productName: "Roses",
        retailPrice: 10,
        unitCost: 5,
        deliveredQuantity: 2,
        returnedQuantity: 0,
        confidence: 1,
      },
    ],
    totalCharges: 10,
    totalCredit: 0,
    totalAmountDue: 0,
    ...overrides,
  };
}

test("inferBlankTotalAmountDue: blank credit and blank total -> total due becomes total charges", () => {
  const extracted = baseInvoice({ totalCharges: 42.5, totalCredit: 0, totalAmountDue: 0 });
  const result = inferBlankTotalAmountDue(extracted);
  assert.equal(result.totalAmountDue, 42.5);
  assert.equal(result.totalCredit, 0);
});

test("inferBlankTotalAmountDue: a written total due is left alone", () => {
  const extracted = baseInvoice({ totalCharges: 100, totalCredit: 0, totalAmountDue: 80 });
  const result = inferBlankTotalAmountDue(extracted);
  assert.equal(result.totalAmountDue, 80);
});

test("inferBlankTotalAmountDue: a written credit is left alone even if total due is blank", () => {
  const extracted = baseInvoice({ totalCharges: 100, totalCredit: 15, totalAmountDue: 0 });
  const result = inferBlankTotalAmountDue(extracted);
  assert.equal(result.totalAmountDue, 0);
});

test("inferBlankTotalAmountDue: zero total charges is left alone (nothing to infer)", () => {
  const extracted = baseInvoice({ totalCharges: 0, totalCredit: 0, totalAmountDue: 0 });
  const result = inferBlankTotalAmountDue(extracted);
  assert.equal(result.totalAmountDue, 0);
});
