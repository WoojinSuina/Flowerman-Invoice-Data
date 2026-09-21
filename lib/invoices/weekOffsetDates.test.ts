import { test } from "node:test";
import assert from "node:assert/strict";
import { findWeekOffsetInvoices } from "./weekOffsetDates.ts";

const DAY = 24 * 60 * 60 * 1000;
// A Sunday, so it's a clean week boundary for these fixtures.
const WEEK_START = new Date("2026-09-13T00:00:00.000Z").getTime();
const d = (offsetDays: number) => new Date(WEEK_START + offsetDays * DAY);

test("all invoices in the same week -> no corrections", () => {
  const invoices = [
    { id: "1", invoiceDate: d(2) },
    { id: "2", invoiceDate: d(5) },
  ];
  assert.deepEqual(findWeekOffsetInvoices(invoices), []);
});

test("an invoice dated in the calendar week before the batch's common week is corrected", () => {
  const invoices = [
    { id: "1", invoiceDate: d(2) },
    { id: "2", invoiceDate: d(5) },
    { id: "3", invoiceDate: d(-4) }, // prior week
  ];
  const result = findWeekOffsetInvoices(invoices);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "3");
  assert.equal(result[0].correctedDate.getTime(), d(3).getTime());
});

test("a delivery route spanning several real days in the prior week all get corrected together", () => {
  // Mirrors a real batch: most invoices land Tue-Fri of the actual week,
  // but a handful of stores from a different route leg were written on
  // last week's pad, spread across three different days of THAT week.
  const invoices = [
    { id: "a", invoiceDate: d(1) },
    { id: "b", invoiceDate: d(2) },
    { id: "c", invoiceDate: d(3) },
    { id: "d", invoiceDate: d(4) },
    { id: "e", invoiceDate: d(-5) },
    { id: "f", invoiceDate: d(-4) },
    { id: "g", invoiceDate: d(-3) },
  ];
  const result = findWeekOffsetInvoices(invoices);
  assert.deepEqual(
    result.map((r) => r.id).sort(),
    ["e", "f", "g"]
  );
  assert.equal(result.find((r) => r.id === "e")!.correctedDate.getTime(), d(2).getTime());
  assert.equal(result.find((r) => r.id === "f")!.correctedDate.getTime(), d(3).getTime());
  assert.equal(result.find((r) => r.id === "g")!.correctedDate.getTime(), d(4).getTime());
});

test("an invoice two weeks early is left alone (not the one-pad-behind pattern)", () => {
  const invoices = [
    { id: "1", invoiceDate: d(2) },
    { id: "2", invoiceDate: d(5) },
    { id: "3", invoiceDate: d(-11) },
  ];
  assert.deepEqual(findWeekOffsetInvoices(invoices), []);
});

test("an invoice a week LATE (not early) is left alone", () => {
  const invoices = [
    { id: "1", invoiceDate: d(2) },
    { id: "2", invoiceDate: d(5) },
    { id: "3", invoiceDate: d(9) },
  ];
  assert.deepEqual(findWeekOffsetInvoices(invoices), []);
});

test("a tie between two weeks resolves to the more recent one", () => {
  const invoices = [
    { id: "1a", invoiceDate: d(-30) },
    { id: "1b", invoiceDate: d(-29) },
    { id: "2a", invoiceDate: d(2) },
    { id: "2b", invoiceDate: d(4) },
    { id: "3", invoiceDate: d(-5) }, // week before the more recent tied week
  ];
  const result = findWeekOffsetInvoices(invoices);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "3");
  assert.equal(result[0].correctedDate.getTime(), d(2).getTime());
});

test("empty batch -> no corrections", () => {
  assert.deepEqual(findWeekOffsetInvoices([]), []);
});
