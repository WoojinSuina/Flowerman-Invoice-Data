import { test } from "node:test";
import assert from "node:assert/strict";
import { isLikelyDuplicate, rawExtractionInvoiceNumber } from "./duplicateDetection.ts";

const ITEM = { productName: "Rose", deliveredQuantity: 8, returnedQuantity: 2, unitCostCents: 279 };
const OTHER_ITEM = { productName: "Lily", deliveredQuantity: 3, returnedQuantity: 0, unitCostCents: 500 };

test("rawExtractionInvoiceNumber: reads invoiceNumber out of a raw extraction object", () => {
  assert.equal(rawExtractionInvoiceNumber({ invoiceNumber: "125014", totalCharges: 10 }), "125014");
});

test("rawExtractionInvoiceNumber: missing/malformed rawExtraction returns undefined", () => {
  assert.equal(rawExtractionInvoiceNumber(null), undefined);
  assert.equal(rawExtractionInvoiceNumber("not an object"), undefined);
  assert.equal(rawExtractionInvoiceNumber([1, 2, 3]), undefined);
  assert.equal(rawExtractionInvoiceNumber({ invoiceNumber: 12345 }), undefined);
});

test("isLikelyDuplicate: matches on total amount due alone", () => {
  const candidate = { totalAmountDueCents: 5000, items: [OTHER_ITEM], rawExtraction: { invoiceNumber: "999" } };
  assert.equal(isLikelyDuplicate(candidate, 5000, [ITEM], "111"), true);
});

test("isLikelyDuplicate: matches on the exact same set of line items", () => {
  const candidate = { totalAmountDueCents: 1, items: [ITEM], rawExtraction: { invoiceNumber: "999" } };
  assert.equal(isLikelyDuplicate(candidate, 9999, [ITEM], "111"), true);
});

test("isLikelyDuplicate: matches when the AI originally read the same invoice number, even if the stored invoice was later corrected to something else", () => {
  // The real bug this covers: invoice #1 was corrected during review (its
  // current invoiceNumber/totals/items no longer match), but its
  // rawExtraction still preserves what the AI first read. A genuine
  // re-scan of the same physical invoice reproduces that same original
  // reading, not the human's correction.
  const candidate = {
    totalAmountDueCents: 12345, // corrected, no longer matches
    items: [OTHER_ITEM], // corrected, no longer matches
    rawExtraction: { invoiceNumber: "1250114" }, // original AI misread, preserved forever
  };
  assert.equal(isLikelyDuplicate(candidate, 9999, [ITEM], "1250114"), true);
});

test("isLikelyDuplicate: no match on any signal is not a duplicate", () => {
  const candidate = { totalAmountDueCents: 12345, items: [OTHER_ITEM], rawExtraction: { invoiceNumber: "999" } };
  assert.equal(isLikelyDuplicate(candidate, 9999, [ITEM], "111"), false);
});

test("isLikelyDuplicate: different item counts is not a duplicate", () => {
  const candidate = { totalAmountDueCents: 9999, items: [ITEM, OTHER_ITEM], rawExtraction: null };
  // totalAmountDueCents intentionally does not match extractedTotal below
  assert.equal(isLikelyDuplicate(candidate, 1, [ITEM], "111"), false);
});
