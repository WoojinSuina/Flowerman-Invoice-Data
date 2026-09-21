import { test } from "node:test";
import assert from "node:assert/strict";
import { isFutureDate, parseSearchDate } from "./dates.ts";

test("isFutureDate: yesterday is not future", () => {
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  assert.equal(isFutureDate(yesterday), false);
});

test("isFutureDate: today (UTC midnight) is not future", () => {
  const now = new Date();
  const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  assert.equal(isFutureDate(todayMidnight), false);
});

test("isFutureDate: tomorrow is future", () => {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  assert.equal(isFutureDate(tomorrow), true);
});

test("isFutureDate: a month/day swap producing a later month is future", () => {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  assert.equal(isFutureDate(nextMonth), true);
});

test("parseSearchDate: ISO YYYY-MM-DD", () => {
  const result = parseSearchDate("2026-09-17");
  assert.equal(result?.toISOString().slice(0, 10), "2026-09-17");
});

test("parseSearchDate: US M/D/YYYY", () => {
  const result = parseSearchDate("9/17/2026");
  assert.equal(result?.toISOString().slice(0, 10), "2026-09-17");
});

test("parseSearchDate: US M/D/YY with 2-digit year prefixed with 20", () => {
  const result = parseSearchDate("9/17/26");
  assert.equal(result?.toISOString().slice(0, 10), "2026-09-17");
});

test("parseSearchDate: zero-padded MM/DD/YYYY", () => {
  const result = parseSearchDate("09/07/2026");
  assert.equal(result?.toISOString().slice(0, 10), "2026-09-07");
});

test("parseSearchDate: an out-of-range month/day is rejected, not silently rolled over", () => {
  assert.equal(parseSearchDate("13/01/2026"), null);
  assert.equal(parseSearchDate("2026-02-30"), null);
});

test("parseSearchDate: plain text (invoice number or store name) is not a date", () => {
  assert.equal(parseSearchDate("125732"), null);
  assert.equal(parseSearchDate("Shell"), null);
});

test("parseSearchDate: surrounding whitespace is trimmed", () => {
  const result = parseSearchDate("  2026-09-17  ");
  assert.equal(result?.toISOString().slice(0, 10), "2026-09-17");
});
