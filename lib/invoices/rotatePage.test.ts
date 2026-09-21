import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, degrees } from "pdf-lib";
import sharp from "sharp";
import { rotatePageBuffer } from "./rotatePage.ts";

async function makePdf(existingRotation = 0): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 300]);
  if (existingRotation) page.setRotation(degrees(existingRotation));
  return Buffer.from(await doc.save());
}

test("PDF: rotation is added to the page's rotation metadata, not re-rendered", async () => {
  const pdf = await makePdf(0);
  const rotated = await rotatePageBuffer(pdf, "application/pdf", 180);
  const reloaded = await PDFDocument.load(rotated);
  assert.equal(reloaded.getPage(0).getRotation().angle, 180);
});

test("PDF: rotation stacks on top of an existing nonzero rotation", async () => {
  const pdf = await makePdf(90);
  const rotated = await rotatePageBuffer(pdf, "application/pdf", 180);
  const reloaded = await PDFDocument.load(rotated);
  assert.equal(reloaded.getPage(0).getRotation().angle, 270);
});

test("raster image: dimensions swap for a 90-degree rotation", async () => {
  const png = await sharp({
    create: { width: 40, height: 60, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();

  const rotated = await rotatePageBuffer(png, "image/png", 90);
  const meta = await sharp(rotated).metadata();
  assert.equal(meta.width, 60);
  assert.equal(meta.height, 40);
});

test("raster image: dimensions unchanged for a 180-degree rotation", async () => {
  const png = await sharp({
    create: { width: 40, height: 60, channels: 3, background: { r: 0, g: 255, b: 0 } },
  })
    .png()
    .toBuffer();

  const rotated = await rotatePageBuffer(png, "image/png", 180);
  const meta = await sharp(rotated).metadata();
  assert.equal(meta.width, 40);
  assert.equal(meta.height, 60);
});
