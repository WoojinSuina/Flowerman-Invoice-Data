"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/review/StatusBadge";
import { PdfPageImage } from "@/components/review/PdfPageImage";

export interface GalleryInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDateLabel: string;
  validationStatus: string;
  sourceImageUrl: string | null;
}

function ScannedImage({ url, alt }: { url: string; alt: string }) {
  return url.toLowerCase().endsWith(".pdf") ? (
    <PdfPageImage src={url} alt={alt} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="w-full rounded border object-contain" />
  );
}

/**
 * A small grid of thumbnails is fine for a quick scan, but too small to
 * actually read/compare invoice contents — this adds a full-size lightbox
 * with Previous/Next (and arrow-key) navigation so flipping between two
 * or more invoices to compare them is fast, without leaving this page or
 * re-opening the grid each time.
 */
export function InvoiceGallery({ invoices }: { invoices: GalleryInvoice[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (openIndex === null) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIndex(null);
      if (e.key === "ArrowLeft") setOpenIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight") {
        setOpenIndex((i) => (i !== null && i < invoices.length - 1 ? i + 1 : i));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openIndex, invoices.length]);

  if (invoices.length === 0) {
    return <p className="text-sm text-gray-500">No scanned invoices for this store yet.</p>;
  }

  const current = openIndex !== null ? invoices[openIndex] : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {invoices.map((invoice, index) => (
          <button
            key={invoice.id}
            type="button"
            onClick={() => setOpenIndex(index)}
            className="block rounded border p-2 text-left hover:bg-gray-50"
          >
            {invoice.sourceImageUrl ? (
              <ScannedImage url={invoice.sourceImageUrl} alt={`Invoice ${invoice.invoiceNumber}`} />
            ) : (
              <div className="flex h-32 items-center justify-center rounded border bg-gray-50 text-xs text-gray-400">
                No image
              </div>
            )}
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="font-medium text-gray-700">#{invoice.invoiceNumber}</span>
              <StatusBadge status={invoice.validationStatus} />
            </div>
            <div className="text-xs text-gray-500">{invoice.invoiceDateLabel}</div>
          </button>
        ))}
      </div>

      {current && openIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpenIndex(null)}
        >
          <div
            className="flex max-h-full w-full max-w-3xl flex-col rounded bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium">Invoice #{current.invoiceNumber}</span>{" "}
                <StatusBadge status={current.validationStatus} />{" "}
                <span className="text-gray-500">{current.invoiceDateLabel}</span>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/review/${current.id}`} className="text-sm text-blue-600 underline">
                  Open full record
                </Link>
                <button
                  type="button"
                  onClick={() => setOpenIndex(null)}
                  aria-label="Close"
                  className="rounded px-2 py-1 text-lg leading-none text-gray-500 hover:bg-gray-100"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {current.sourceImageUrl ? (
                <ScannedImage url={current.sourceImageUrl} alt={`Invoice ${current.invoiceNumber}`} />
              ) : (
                <p className="text-sm text-gray-400">No image available.</p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setOpenIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
                disabled={openIndex === 0}
                className="rounded bg-gray-100 px-3 py-1 text-sm disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="text-xs text-gray-400">
                {openIndex + 1} of {invoices.length} — use arrow keys to flip through
              </span>
              <button
                type="button"
                onClick={() =>
                  setOpenIndex((i) => (i !== null && i < invoices.length - 1 ? i + 1 : i))
                }
                disabled={openIndex === invoices.length - 1}
                className="rounded bg-gray-100 px-3 py-1 text-sm disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
