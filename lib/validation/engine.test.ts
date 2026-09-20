import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateInvoice,
  validateLineItem,
  suggestQuantityErrors,
  effectiveStatusForConsignment,
} from "./engine.ts";

test("trivial empty invoice (0/0/0) -> PASS", () => {
  const result = validateInvoice({
    invoiceTotalChargesCents: 0,
    invoiceTotalCreditCents: 0,
    invoiceTotalAmountDueCents: 0,
    items: [],
  });
  assert.equal(result.status, "PASS");
});

test("delivered=8 returned=3 cost=2.79 -> sold=5, correct credit/net", () => {
  const item = validateLineItem({
    productName: "Rose",
    unitCostCents: 279,
    deliveredQuantity: 8,
    returnedQuantity: 3,
  });
  assert.equal(item.soldQuantity, 5);
  assert.equal(item.returnCreditCents, 3 * 279);
  assert.equal(item.netSoldAmountCents, 5 * 279);
  assert.equal(item.deliveredAmountCents, 8 * 279);
  assert.equal(item.hasImpossibleQuantity, false);
});

test("full invoice reconciling exactly -> PASS", () => {
  const items = [
    { productName: "Rose", unitCostCents: 279, deliveredQuantity: 8, returnedQuantity: 3 },
    { productName: "Large Bouquet", unitCostCents: 1189, deliveredQuantity: 5, returnedQuantity: 2 },
  ];
  const charges = 8 * 279 + 5 * 1189; // 2232 + 5945 = 8177
  const credit = 3 * 279 + 2 * 1189; // 837 + 2378 = 3215
  const amountDue = charges - credit; // 4962
  const result = validateInvoice({
    invoiceTotalChargesCents: charges,
    invoiceTotalCreditCents: credit,
    invoiceTotalAmountDueCents: amountDue,
    items,
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.differenceCents, 0);
});

test("one-unit handwriting mistake -> REVIEW with correct suggestion", () => {
  // Same as above but returned quantity for Rose was misread as 3 instead of 4,
  // so invoice amount due is $4.19 (2 Rose x 2.79... use a cost that divides evenly)
  const items = [
    { productName: "2 Rose Bouquet", unitCostCents: 419, deliveredQuantity: 8, returnedQuantity: 3 },
    { productName: "Large Bouquet", unitCostCents: 1189, deliveredQuantity: 5, returnedQuantity: 2 },
  ];
  // Invoice printed amount due assumes returned=4 for the Rose line (one more than extracted)
  const correctReturned = 4;
  const trueCredit = correctReturned * 419 + 2 * 1189;
  const trueCharges = 8 * 419 + 5 * 1189;
  const invoiceAmountDue = trueCharges - trueCredit;

  const result = validateInvoice({
    invoiceTotalChargesCents: trueCharges,
    invoiceTotalCreditCents: trueCredit,
    invoiceTotalAmountDueCents: invoiceAmountDue,
    items, // extracted with returnedQuantity=3, one less than truth
  });

  assert.equal(result.status, "REVIEW");
  assert.equal(result.differenceCents, -419); // calculated due is 419 cents too HIGH
  assert.ok(result.suggestions.length >= 1);
  assert.equal(result.suggestions[0].possibleQuantityError, 1);
  assert.equal(result.suggestions[0].productName, "2 Rose Bouquet");
});

test("multiple-unit mistake is detected (difference = 2x unit cost)", () => {
  const suggestions = suggestQuantityErrors(838, [
    { productName: "Rose", unitCostCents: 419, deliveredQuantity: 10, returnedQuantity: 0 },
  ]);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].possibleQuantityError, 2);
});

test("zero returns -> sold equals delivered", () => {
  const item = validateLineItem({
    productName: "Rose",
    unitCostCents: 279,
    deliveredQuantity: 10,
    returnedQuantity: 0,
  });
  assert.equal(item.soldQuantity, 10);
  assert.equal(item.returnCreditCents, 0);
});

test("all items returned -> sold is zero, not negative", () => {
  const item = validateLineItem({
    productName: "Rose",
    unitCostCents: 279,
    deliveredQuantity: 6,
    returnedQuantity: 6,
  });
  assert.equal(item.soldQuantity, 0);
  assert.equal(item.hasImpossibleQuantity, false);
});

test("returned > delivered -> flagged as impossible, forces REVIEW", () => {
  const result = validateInvoice({
    invoiceTotalChargesCents: 1000,
    invoiceTotalCreditCents: 1000,
    invoiceTotalAmountDueCents: 0,
    items: [{ productName: "Rose", unitCostCents: 100, deliveredQuantity: 5, returnedQuantity: 9 }],
  });
  assert.equal(result.status, "REVIEW");
  assert.equal(result.items[0].hasImpossibleQuantity, true);
});

test("negative quantities are flagged as impossible", () => {
  const item = validateLineItem({
    productName: "Rose",
    unitCostCents: 279,
    deliveredQuantity: -2,
    returnedQuantity: 0,
  });
  assert.equal(item.hasImpossibleQuantity, true);
});

test("rounding: differences within $0.01 tolerance still PASS", () => {
  const items = [{ productName: "Rose", unitCostCents: 333, deliveredQuantity: 3, returnedQuantity: 1 }];
  // true amount due = (3-1)*333 = 666
  const result = validateInvoice({
    invoiceTotalChargesCents: 999,
    invoiceTotalCreditCents: 333,
    invoiceTotalAmountDueCents: 667, // off by exactly 1 cent
    items,
  });
  assert.equal(result.status, "PASS");
});

test("difference greater than $0.01 fails even if internally consistent", () => {
  const items = [{ productName: "Rose", unitCostCents: 333, deliveredQuantity: 3, returnedQuantity: 1 }];
  const result = validateInvoice({
    invoiceTotalChargesCents: 999,
    invoiceTotalCreditCents: 333,
    invoiceTotalAmountDueCents: 668, // off by 2 cents
    items,
  });
  assert.equal(result.status, "REVIEW");
});

test("no suggestion offered when difference matches no unit cost (unexplained)", () => {
  const suggestions = suggestQuantityErrors(777, [
    { productName: "Rose", unitCostCents: 419, deliveredQuantity: 5, returnedQuantity: 0 },
  ]);
  assert.equal(suggestions.length, 0);
});

test("duplicate-invoice-number handling is a DB-layer concern, not validation engine", () => {
  // Documented here so the constraint isn't forgotten: enforced via the
  // Prisma @@unique([invoiceNumber, storeId]) constraint, not in this module.
  assert.ok(true);
});

test("effectiveStatusForConsignment: non-consignment invoice is untouched", () => {
  const result = validateInvoice({
    invoiceTotalChargesCents: 10000,
    invoiceTotalCreditCents: 0,
    invoiceTotalAmountDueCents: 19000, // huge mismatch -> REVIEW
    items: [{ productName: "Rose", unitCostCents: 100, deliveredQuantity: 100, returnedQuantity: 0 }],
  });
  assert.equal(result.status, "REVIEW");
  assert.equal(effectiveStatusForConsignment(result, false), "REVIEW");
});

test("effectiveStatusForConsignment: consignment invoice with a real gap still PASSes", () => {
  const result = validateInvoice({
    invoiceTotalChargesCents: 24330,
    invoiceTotalCreditCents: 8117,
    invoiceTotalAmountDueCents: 19012, // real example: doesn't reconcile with this page's math
    items: [{ productName: "Rose", unitCostCents: 279, deliveredQuantity: 8, returnedQuantity: 4 }],
  });
  assert.equal(result.status, "REVIEW");
  assert.equal(effectiveStatusForConsignment(result, true), "PASS");
});

test("effectiveStatusForConsignment: an impossible quantity still forces REVIEW even for consignment", () => {
  const result = validateInvoice({
    invoiceTotalChargesCents: 1000,
    invoiceTotalCreditCents: 0,
    invoiceTotalAmountDueCents: 500,
    items: [{ productName: "Rose", unitCostCents: 100, deliveredQuantity: 2, returnedQuantity: 5 }],
  });
  assert.equal(effectiveStatusForConsignment(result, true), "REVIEW");
});
