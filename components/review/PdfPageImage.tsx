"use client";

import { useEffect, useRef, useState } from "react";

export function PdfPageImage({ src, alt }: { src: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setError(null);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const pdf = await pdfjs.getDocument({ url: src }).promise;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = (container.clientWidth / unscaledViewport.width) * dpr;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = "100%";
        canvas.style.height = `${viewport.height / dpr}px`;

        await page.render({ canvas, viewport }).promise;
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div ref={containerRef} className="w-full">
      {error ? (
        <div className="flex h-64 items-center justify-center rounded border bg-red-50 px-4 text-center text-sm text-red-700">
          Failed to render invoice: {error}
        </div>
      ) : (
        <canvas ref={canvasRef} role="img" aria-label={alt} className="rounded border" />
      )}
    </div>
  );
}
