import { test } from "node:test";
import assert from "node:assert/strict";
import { isFutureDate } from "./dates.ts";

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
