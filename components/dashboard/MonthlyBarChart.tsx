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
  /** Second series (profit) shown as a bar right next to the first. */
  secondaryValue: number;
  secondaryDisplayValue: string;
}

const CHART_HEIGHT_PX = 140;
// A fixed per-month column width (rather than flex-1 splitting the
// available width) so 12 months of labeled bars stay legible instead of
// being squeezed to fit a narrow screen — the chart scrolls horizontally
// on a phone instead.
const COLUMN_WIDTH_PX = 72;

/**
 * A two-series grouped bar chart (e.g. revenue + profit) across the 12
 * months of a year. Plain divs, not a charting library — thin bars
 * anchored to the baseline, a direct value label above each bar, and
 * each column links to the Dashboard for that month. Two independent
 * markers can both be shown at once: `selectedMonthValue` (whichever
 * month the rest of the page is scoped to via the picker — the loud
 * amber box) and `todayMonthValue` (today's real calendar month — a
 * smaller blue dot, since it needs to stay visible even when a
 * different month is selected). No client interactivity needed (labels
 * are always visible, not hover-only), so this renders as a plain
 * Server Component.
 */
export function MonthlyBarChart({
  data,
  color,
  secondaryColor,
  seriesLabel,
  secondarySeriesLabel,
  selectedMonthValue,
  todayMonthValue,
}: {
  data: MonthlyBarDatum[];
  color: string;
  secondaryColor: string;
  seriesLabel: string;
  secondarySeriesLabel: string;
  selectedMonthValue?: string;
  todayMonthValue?: string;
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.secondaryValue]));
  const totalWidth = data.length * COLUMN_WIDTH_PX;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
          {seriesLabel}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: secondaryColor }}
          />
          {secondarySeriesLabel}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div
          className="flex items-end"
          style={{ height: CHART_HEIGHT_PX + 28, minWidth: totalWidth }}
        >
          {data.map((d) => {
            const isSelected = d.monthValue === selectedMonthValue;
            const isToday = d.monthValue === todayMonthValue;
            const barHeight = d.value > 0 ? Math.max(4, Math.round((d.value / max) * CHART_HEIGHT_PX)) : 0;
            const secondaryHeight =
              d.secondaryValue > 0 ? Math.max(4, Math.round((d.secondaryValue / max) * CHART_HEIGHT_PX)) : 0;
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
                <div className="flex items-end gap-1">
                  <div className="flex flex-col items-center justify-end" style={{ height: CHART_HEIGHT_PX }}>
                    <span
                      className={
                        isSelected
                          ? "mb-1 whitespace-nowrap text-[10px] font-semibold leading-none tabular-nums text-amber-800"
                          : "mb-1 whitespace-nowrap text-[10px] font-medium leading-none tabular-nums text-gray-600 group-hover:text-gray-900"
                      }
                    >
                      {d.displayValue}
                    </span>
                    <div
                      className={
                        isSelected
                          ? "w-4 rounded-t ring-2 ring-offset-1 ring-amber-500"
                          : "w-4 rounded-t transition-opacity group-hover:opacity-80"
                      }
                      style={{ height: barHeight, backgroundColor: color }}
                    />
                  </div>
                  <div className="flex flex-col items-center justify-end" style={{ height: CHART_HEIGHT_PX }}>
                    <span className="mb-1 whitespace-nowrap text-[10px] font-medium leading-none tabular-nums text-gray-600 group-hover:text-gray-900">
                      {d.secondaryDisplayValue}
                    </span>
                    <div
                      className="w-4 rounded-t transition-opacity group-hover:opacity-80"
                      style={{ height: secondaryHeight, backgroundColor: secondaryColor }}
                    />
                  </div>
                </div>
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
    </div>
  );
}
