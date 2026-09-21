import { PDFDocument, degrees } from "pdf-lib";
import sharp from "sharp";

/**
 * Physically rotates a single invoice page's bytes clockwise by the given
 * number of degrees — used when extraction detects the scan was fed in
 * upside-down or sideways, so both a follow-up extraction attempt and
 * every future human review see it right-side up.
 *
 * A PDF page's rotation is metadata-only (lossless, and respected by
 * pdfjs when rendering it for display), so it's just added to whatever
 * rotation the page already has. A raster image has no such universally
 * respected "please rotate" tag, so it's physically re-encoded instead.
 */
export async function rotatePageBuffer(
  buffer: Buffer,
  mimeType: string,
  clockwiseDegrees: 90 | 180 | 270
): Promise<Buffer> {
  if (mimeType === "application/pdf") {
    const doc = await PDFDocument.load(buffer);
    const page = doc.getPage(0);
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + clockwiseDegrees) % 360));
    return Buffer.from(await doc.save());
  }
  return sharp(buffer).rotate(clockwiseDegrees).toBuffer();
}
