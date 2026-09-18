import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { splitPdfIntoPages } from "./splitPages.ts";

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([200, 200]);
  }
  return Buffer.from(await doc.save());
}

test("splits a 3-page PDF into 3 independently valid single-page PDFs", async () => {
  const pdf = await makePdf(3);
  const pages = await splitPdfIntoPages(pdf);

  assert.equal(pages.length, 3);
  assert.deepEqual(
    pages.map((p) => p.pageNumber),
    [1, 2, 3]
  );

  for (const page of pages) {
    const reloaded = await PDFDocument.load(page.buffer);
    assert.equal(reloaded.getPageCount(), 1);
  }
});

test("a 1-page PDF splits into a single page", async () => {
  const pdf = await makePdf(1);
  const pages = await splitPdfIntoPages(pdf);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].pageNumber, 1);
});

test("an invalid buffer throws a descriptive error", async () => {
  await assert.rejects(
    () => splitPdfIntoPages(Buffer.from("not a pdf")),
    /Could not parse PDF/
  );
});
