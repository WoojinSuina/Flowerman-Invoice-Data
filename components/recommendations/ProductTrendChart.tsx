export interface ComparisonPoint {
  dateLabel: string;
  delivered: number;
  sold: number;
}

export const DELIVERED_COLOR = "#2563eb"; // blue
export const SOLD_COLOR = "#ea580c"; // orange (validated against blue via the dataviz palette script)

const CHART_HEIGHT_PX = 110;
// Recent invoices only, not the whole history — with delivered AND sold
// each getting a bar plus a value label, showing everything would make
// this unreadably wide.
const RECENT_COUNT = 6;

/**
 * Delivered vs. sold, side by side, for a product's most recent invoices
 * at this store — a grouped bar chart with the actual numbers labeled on
 * every bar (not hover-only), so an over/under-supply pattern is visible
 * at a glance instead of needing to open each invoice. Given its own
 * full-width row (not squeezed into a table cell) so the bars and labels
 * are actually legible.
 */
export function ProductComparisonChart({ points }: { points: ComparisonPoint[] }) {
  if (points.length === 0) {
    return <span className="text-sm text-gray-400">No history</span>;
  }

  const recent = points.slice(-RECENT_COUNT);
  const max = Math.max(1, ...recent.flatMap((p) => [p.delivered, p.sold]));

  return (
    <div className="flex items-end gap-8" style={{ height: CHART_HEIGHT_PX + 44 }}>
      {recent.map((p, i) => {
        const deliveredHeight = Math.max(3, Math.round((p.delivered / max) * CHART_HEIGHT_PX));
        const soldHeight = Math.max(3, Math.round((p.sold / max) * CHART_HEIGHT_PX));
        return (
          <div
            key={`${p.dateLabel}-${i}`}
            className="flex flex-col items-center"
            style={{ height: CHART_HEIGHT_PX + 44 }}
          >
            <div className="flex flex-1 items-end gap-2">
              <div
                className="flex flex-col items-center justify-end"
                style={{ height: CHART_HEIGHT_PX }}
              >
                <span className="mb-1 text-sm font-semibold leading-none tabular-nums text-gray-700">
                  {p.delivered}
                </span>
                <div
                  className="w-6 rounded-t"
                  style={{ height: deliveredHeight, backgroundColor: DELIVERED_COLOR }}
                />
              </div>
              <div
                className="flex flex-col items-center justify-end"
                style={{ height: CHART_HEIGHT_PX }}
              >
                <span className="mb-1 text-sm font-semibold leading-none tabular-nums text-gray-700">
                  {p.sold}
                </span>
                <div
                  className="w-6 rounded-t"
                  style={{ height: soldHeight, backgroundColor: SOLD_COLOR }}
                />
              </div>
            </div>
            <div className="mt-2 whitespace-nowrap text-xs text-gray-500">{p.dateLabel}</div>
          </div>
        );
      })}
    </div>
  );
}
