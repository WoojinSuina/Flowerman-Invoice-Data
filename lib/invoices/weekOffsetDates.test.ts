import { test } from "node:test";
import assert from "node:assert/strict";
import { findWeekOffsetInvoices } from "./weekOffsetDates.ts";

const DAY = 24 * 60 * 60 * 1000;
const WEEK_OF = new Date("2026-09-14T00:00:00.000Z").getTime();
const PRIOR_WEEK = new Date(WEEK_OF - 7 * DAY);
const CURRENT_WEEK = new Date(WEEK_OF);

test("all invoices dated the same -> no corrections", () => {
  const invoices = [
    { id: "1", invoiceDate: CURRENT_WEEK, isConsignment: false },
    { id: "2", invoiceDate: CURRENT_WEEK, isConsignment: true },
  ];
  assert.deepEqual(findWeekOffsetInvoices(invoices), []);
});

test("a consignment invoice exactly 7 days before the batch's common date is corrected", () => {
  const invoices = [
    { id: "1", invoiceDate: CURRENT_WEEK, isConsignment: false },
    { id: "2", invoiceDate: CURRENT_WEEK, isConsignment: false },
    { id: "3", invoiceDate: PRIOR_WEEK, isConsignment: true },
  ];
  const result = findWeekOffsetInvoices(invoices);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "3");
  assert.equal(result[0].correctedDate.getTime(), CURRENT_WEEK.getTime());
});

test("a non-consignment invoice a week early is left alone (a real discrepancy, not a paper mixup)", () => {
  const invoices = [
    { id: "1", invoiceDate: CURRENT_WEEK, isConsignment: false },
    { id: "2", invoiceDate: CURRENT_WEEK, isConsignment: false },
    { id: "3", invoiceDate: PRIOR_WEEK, isConsignment: false },
  ];
  assert.deepEqual(findWeekOffsetInvoices(invoices), []);
});

test("a consignment invoice only 1 day off is not touched (not a whole-week mixup)", () => {
  const oneDayEarly = new Date(CURRENT_WEEK.getTime() - DAY);
  const invoices = [
    { id: "1", invoiceDate: CURRENT_WEEK, isConsignment: false },
    { id: "2", invoiceDate: CURRENT_WEEK, isConsignment: false },
    { id: "3", invoiceDate: oneDayEarly, isConsignment: true },
  ];
  assert.deepEqual(findWeekOffsetInvoices(invoices), []);
});

test("a consignment invoice a week LATE (not early) is left alone", () => {
  const weekLate = new Date(CURRENT_WEEK.getTime() + 7 * DAY);
  const invoices = [
    { id: "1", invoiceDate: CURRENT_WEEK, isConsignment: false },
    { id: "2", invoiceDate: CURRENT_WEEK, isConsignment: false },
    { id: "3", invoiceDate: weekLate, isConsignment: true },
  ];
  assert.deepEqual(findWeekOffsetInvoices(invoices), []);
});

test("a tie in the most common date resolves to the more recent one", () => {
  const olderDate = new Date("2026-08-01T00:00:00.000Z");
  const newerDate = new Date("2026-08-15T00:00:00.000Z");
  const weekBeforeNewer = new Date(newerDate.getTime() - 7 * DAY);
  const invoices = [
    { id: "1a", invoiceDate: olderDate, isConsignment: false },
    { id: "1b", invoiceDate: olderDate, isConsignment: false },
    { id: "2a", invoiceDate: newerDate, isConsignment: false },
    { id: "2b", invoiceDate: newerDate, isConsignment: false },
    { id: "3", invoiceDate: weekBeforeNewer, isConsignment: true },
  ];
  const result = findWeekOffsetInvoices(invoices);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "3");
  assert.equal(result[0].correctedDate.getTime(), newerDate.getTime());
});

test("empty batch -> no corrections", () => {
  assert.deepEqual(findWeekOffsetInvoices([]), []);
});
