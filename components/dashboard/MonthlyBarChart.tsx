import Link from "next/link";

export interface MonthlyBarDatum {
  /** Short axis label, e.g. "Jan". */
  label: string;
  /** YYYY-MM, used to link a bar to that month's invoices. */
  monthValue: string;
  value: number;
  /** Pre-formatted for the value label — a function can't cross the
   * server/client boundary, so formatting happens server-side instead. */
  displayValue: string;
}

const CHART_HEIGHT_PX = 140;

/**
 * A single-series bar chart for one metric across the 12 months of a year.
 * Plain divs, not a charting library — thin bars anchored to the baseline,
 * a direct value label above each bar, the currently-viewed month
 * highlighted, and each bar links to that month's filtered Review list.
 * One series needs no legend (the section heading above it names the
 * metric). No client interactivity needed (labels are always visible, not
 * hover-only), so this renders as a plain Server Component.
 */
export function MonthlyBarChart({
  data,
  color,
  highlightMonthValue,
}: {
  data: MonthlyBarDatum[];
  color: string;
  highlightMonthValue?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: CHART_HEIGHT_PX + 20 }}>
        {data.map((d) => {
          const isCurrent = d.monthValue === highlightMonthValue;
          const barHeight = d.value > 0 ? Math.max(4, Math.round((d.value / max) * CHART_HEIGHT_PX)) : 0;
          return (
            <Link
              key={d.monthValue}
              href={`/review?status=ALL&month=${d.monthValue}`}
              className={`group flex flex-1 flex-col items-center justify-end rounded ${
                isCurrent ? "bg-gray-100" : "hover:bg-gray-50"
              }`}
              style={{ height: CHART_HEIGHT_PX + 20 }}
            >
              <div className="mb-1 whitespace-nowrap text-[10px] leading-none text-gray-500 group-hover:text-gray-900">
                {d.displayValue}
              </div>
              <div
                className="w-full rounded-t transition-opacity group-hover:opacity-80"
                style={{ height: barHeight, backgroundColor: color, minWidth: 6 }}
              />
            </Link>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2 text-xs">
        {data.map((d) => (
          <div
            key={d.monthValue}
            className={
              d.monthValue === highlightMonthValue
                ? "flex-1 text-center font-semibold text-gray-900"
                : "flex-1 text-center text-gray-500"
            }
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
