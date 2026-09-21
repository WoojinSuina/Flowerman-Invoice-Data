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
// A fixed per-month column width (rather than flex-1 splitting the
// available width) so 12 months of labeled bars stay legible instead of
// being squeezed to fit a narrow screen — the chart scrolls horizontally
// on a phone instead.
const COLUMN_WIDTH_PX = 56;

/**
 * A single-series bar chart for one metric across the 12 months of a year.
 * Plain divs, not a charting library — thin bars anchored to the baseline,
 * a direct value label above each bar, and each bar links to the
 * Dashboard for that month. Two independent markers can both be shown at
 * once: `selectedMonthValue` (whichever month the rest of the page is
 * scoped to via the picker — the loud amber box) and `todayMonthValue`
 * (today's real calendar month — a smaller blue dot, since it needs to
 * stay visible even when a different month is selected). One series
 * needs no legend (the section heading above it names the metric). No
 * client interactivity needed (labels are always visible, not
 * hover-only), so this renders as a plain Server Component.
 */
export function MonthlyBarChart({
  data,
  color,
  selectedMonthValue,
  todayMonthValue,
}: {
  data: MonthlyBarDatum[];
  color: string;
  selectedMonthValue?: string;
  todayMonthValue?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const totalWidth = data.length * COLUMN_WIDTH_PX;

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end" style={{ height: CHART_HEIGHT_PX + 28, minWidth: totalWidth }}>
        {data.map((d) => {
          const isSelected = d.monthValue === selectedMonthValue;
          const isToday = d.monthValue === todayMonthValue;
          const barHeight = d.value > 0 ? Math.max(4, Math.round((d.value / max) * CHART_HEIGHT_PX)) : 0;
          return (
            <Link
              key={d.monthValue}
              href={`/dashboard?month=${d.monthValue}`}
              className={
                isSelected
                  ? "group relative flex flex-col items-center justify-end rounded-lg border-2 border-amber-400 bg-amber-50"
                  : "group relative flex flex-col items-center justify-end rounded-lg border-2 border-transparent hover:bg-gray-50"
              }
              style={{ flex: `1 0 ${COLUMN_WIDTH_PX}px`, height: CHART_HEIGHT_PX + 28 }}
            >
              {isToday && (
                <span
                  className="absolute top-0 h-1.5 w-1.5 rounded-full bg-blue-600"
                  title="Current month"
                />
              )}
              <div
                className={
                  isSelected
                    ? "mb-1 whitespace-nowrap text-xs font-semibold leading-none tabular-nums text-amber-800"
                    : "mb-1 whitespace-nowrap text-xs font-medium leading-none tabular-nums text-gray-600 group-hover:text-gray-900"
                }
              >
                {d.displayValue}
              </div>
              <div
                className={
                  isSelected
                    ? "w-6 rounded-t ring-2 ring-offset-1 ring-amber-500"
                    : "w-6 rounded-t transition-opacity group-hover:opacity-80"
                }
                style={{ height: barHeight, backgroundColor: color }}
              />
            </Link>
          );
        })}
      </div>
      <div className="mt-1 flex" style={{ minWidth: totalWidth }}>
        {data.map((d) => {
          const isSelected = d.monthValue === selectedMonthValue;
          const isToday = d.monthValue === todayMonthValue;
          return (
            <div
              key={d.monthValue}
              className={
                isSelected
                  ? "text-center text-xs font-bold text-amber-800"
                  : isToday
                    ? "text-center text-xs font-semibold text-blue-700"
                    : "text-center text-xs text-gray-500"
              }
              style={{ flex: `1 0 ${COLUMN_WIDTH_PX}px` }}
            >
              {d.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
