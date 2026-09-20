import { test } from "node:test";
import assert from "node:assert/strict";
import { isConsignmentStore } from "./stores.ts";

test("isConsignmentStore: plain CON suffix on address", () => {
  assert.equal(isConsignmentStore({ name: "EXXON", address: "4307 DUNCANVILLE RD CON" }), true);
});

test("isConsignmentStore: starred CON suffix variants", () => {
  assert.equal(isConsignmentStore({ name: "SHELL", address: "LAKEJUNE/ST AUGUSTIN *CON" }), true);
  assert.equal(isConsignmentStore({ name: "7-11", address: "700 I-20E /MATLOCK ARLINGTON **CON" }), true);
  assert.equal(isConsignmentStore({ name: "VALERO", address: "I-35/FELIX FT.WORTH #CON" }), true);
});

test("isConsignmentStore: no CON suffix is regular", () => {
  assert.equal(isConsignmentStore({ name: "VALERO", address: "829 W MILLER RD GARLAND TX75041" }), false);
});

test("isConsignmentStore: null address, non-CON name is regular", () => {
  assert.equal(isConsignmentStore({ name: "VALERO", address: null }), false);
});

test("isConsignmentStore: CON must be at the end, not merely present", () => {
  assert.equal(isConsignmentStore({ name: "CONVENIENCE MART", address: "123 MAIN ST" }), false);
});
