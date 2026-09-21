"use client";

import { useState } from "react";
import Link from "next/link";

export interface MonthlyBarDatum {
  /** Short axis label, e.g. "Jan". */
  label: string;
  /** YYYY-MM, used to link a bar to that month's invoices. */
  monthValue: string;
  value: number;
  /** Pre-formatted for the hover tooltip — a function can't cross the
   * server/client boundary, so formatting happens server-side instead. */
  displayValue: string;
}

const CHART_HEIGHT_PX = 140;

/**
 * A single-series bar chart for one metric across the 12 months of a year.
 * Plain divs, not a charting library — thin bars anchored to the baseline,
 * a hover tooltip with the exact value, and each bar links to that
 * month's filtered Review list. One series needs no legend (the section
 * heading above it names the metric).
 */
export function MonthlyBarChart({ data, color }: { data: MonthlyBarDatum[]; color: string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: CHART_HEIGHT_PX }}>
        {data.map((d, i) => {
          const barHeight = d.value > 0 ? Math.max(4, Math.round((d.value / max) * CHART_HEIGHT_PX)) : 0;
          return (
            <Link
              key={d.monthValue}
              href={`/review?status=ALL&month=${d.monthValue}`}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: CHART_HEIGHT_PX }}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {hoverIndex === i && (
                <div className="absolute -top-7 z-10 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white">
                  {d.displayValue}
                </div>
              )}
              <div
                className="w-full rounded-t transition-opacity group-hover:opacity-80"
                style={{ height: barHeight, backgroundColor: color, minWidth: 6 }}
              />
            </Link>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2 text-xs text-gray-500">
        {data.map((d) => (
          <div key={d.monthValue} className="flex-1 text-center">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
