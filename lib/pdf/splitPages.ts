import { PDFDocument } from "pdf-lib";

/**
 * Splits a multi-page PDF into single-page PDFs. Each resulting buffer is
 * an independently valid PDF, sendable to Claude as a `document` content
 * block or renderable on its own in a browser <iframe>. Pure — no DB, no
 * network.
 */

export interface SplitPdfPage {
  pageNumber: number; // 1-based, matches Invoice.sourcePage
  buffer: Buffer;
}

export async function splitPdfIntoPages(pdfBuffer: Buffer): Promise<SplitPdfPage[]> {
  let srcDoc: PDFDocument;
  try {
    srcDoc = await PDFDocument.load(pdfBuffer);
  } catch (err) {
    throw new Error(`Could not parse PDF: ${(err as Error).message}`);
  }

  const pageCount = srcDoc.getPageCount();
  if (pageCount === 0) {
    throw new Error("PDF has no pages");
  }

  const pages: SplitPdfPage[] = [];
  for (let i = 0; i < pageCount; i++) {
    const newDoc = await PDFDocument.create();
    const [copiedPage] = await newDoc.copyPages(srcDoc, [i]);
    newDoc.addPage(copiedPage);
    const bytes = await newDoc.save();
    pages.push({ pageNumber: i + 1, buffer: Buffer.from(bytes) });
  }

  return pages;
}
