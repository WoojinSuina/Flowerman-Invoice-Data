import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBrand, isConsignmentStore, isUnfamiliarAddress, normalizeStoreIdentity } from "./stores.ts";

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

test("normalizeStoreIdentity: strips *CON, *GON, and TCON variants identically", () => {
  const base = { name: "LOBO PETRO", address: "601 E MALLOY BRIDGE RD SEAGO VILLE" };
  const variants = [
    { name: "LOBO PETRO", address: "601 E MALLOY BRIDGE RD SEAGO VILLE *CON" },
    { name: "LOBO PETRO", address: "601 E MALLOY BRIDGE RD SEAGO VILLE *GON" },
    { name: "LOBO PETRO", address: "601 E MALLOY BRIDGE RD SEAGO VILLE TCON" },
    { name: "LOBO PETRO", address: "601 E MALLOY BRIDGE RD SEAGO VILLE #CON" },
    base,
  ];
  const normalized = variants.map(normalizeStoreIdentity);
  for (const n of normalized) {
    assert.deepEqual(n, normalizeStoreIdentity(base));
  }
});

test("normalizeStoreIdentity: does not eat real address words that merely end in con/gon", () => {
  const result = normalizeStoreIdentity({ name: "SHELL", address: "100 FALCON WAY" });
  assert.equal(result.address, "100 FALCON WAY");
});

test("normalizeStoreIdentity: a longer trailing word ending in con/gon is not stripped", () => {
  // "WAGON" ends in the letters "GON" but is a whole 5-letter word, not
  // the bare "GON"/"CON"/"TCON" token this only ever strips.
  const result = normalizeStoreIdentity({ name: "SHELL", address: "100 WAGON WHEEL DR" });
  assert.equal(result.address, "100 WAGON WHEEL DR");
});

test("normalizeStoreIdentity: an address with no marker at all is unchanged", () => {
  const result = normalizeStoreIdentity({ name: "LOBO PETRO", address: "601 E MALLOY BRIDGE RD SEAGOVILLE" });
  assert.equal(result.address, "601 E MALLOY BRIDGE RD SEAGOVILLE");
});

test("normalizeStoreIdentity: null address stays null", () => {
  assert.deepEqual(normalizeStoreIdentity({ name: "VALERO", address: null }), { name: "VALERO", address: null });
});

test("extractBrand: a bare brand name is itself", () => {
  assert.equal(extractBrand("SHELL"), "SHELL");
});

test("extractBrand: extra address text folded into name is dropped", () => {
  assert.equal(extractBrand("VALERO FOREST HILL / ENON"), "VALERO");
});

test("extractBrand: is case-insensitive", () => {
  assert.equal(extractBrand("shell"), "SHELL");
});

test("extractBrand: surrounding whitespace is trimmed", () => {
  assert.equal(extractBrand("  EXXON  BELT LINE"), "EXXON");
});

test("isUnfamiliarAddress: real OCR noise on the same address is not flagged", () => {
  assert.equal(
    isUnfamiliarAddress("MACCART AVE FT WORTH/I:CON", "MAGCART AVE FT WORTH/I 20N"),
    false
  );
});

test("isUnfamiliarAddress: a genuinely different address is flagged", () => {
  // A real collision found in this app's data: two different real SHELL
  // locations ended up sharing a (storeNumber, brand) pair.
  assert.equal(
    isUnfamiliarAddress("2221 W SEMINARY DR FT WORTH", "MACCART AVE FT WORTH/I:CON"),
    true
  );
});

test("isUnfamiliarAddress: identical addresses are not flagged", () => {
  assert.equal(isUnfamiliarAddress("2800 N MACARTHUR BLVD IRVING", "2800 N MACARTHUR BLVD IRVING"), false);
});

test("isUnfamiliarAddress: nothing on file yet is not flagged", () => {
  assert.equal(isUnfamiliarAddress(null, "ANY ADDRESS"), false);
});

test("isUnfamiliarAddress: nothing extracted this time is not flagged", () => {
  assert.equal(isUnfamiliarAddress("ON FILE ADDRESS", null), false);
});
