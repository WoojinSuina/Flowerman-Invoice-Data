export interface ComparisonPoint {
  dateLabel: string;
  delivered: number;
  sold: number;
  /** Same calendar month, one year earlier, averaged if more than one
   * invoice matched — undefined until a store has a second year of
   * history for this product. */
  priorYear?: { delivered: number; sold: number };
}

export const DELIVERED_COLOR = "#2563eb"; // blue
export const SOLD_COLOR = "#ea580c"; // orange (validated against blue via the dataviz palette script)

const CHART_HEIGHT_PX = 110;
// Recent invoices only, not the whole history — with delivered AND sold
// each getting a bar plus a value label, showing everything would make
// this unreadably wide.
const RECENT_COUNT = 6;

function Bar({
  value,
  height,
  color,
  muted,
}: {
  value: number;
  height: number;
  color: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-end" style={{ height: CHART_HEIGHT_PX }}>
      <span
        className={
          muted
            ? "mb-1 text-xs font-medium leading-none tabular-nums text-gray-400"
            : "mb-1 text-sm font-semibold leading-none tabular-nums text-gray-700"
        }
      >
        {value}
      </span>
      <div
        className="w-6 rounded-t"
        style={{ height, backgroundColor: color, opacity: muted ? 0.45 : 1 }}
      />
    </div>
  );
}

/**
 * Delivered vs. sold, side by side, for a product's most recent invoices
 * at this store — a grouped bar chart with the actual numbers labeled on
 * every bar (not hover-only), so an over/under-supply pattern is visible
 * at a glance instead of needing to open each invoice. Given its own
 * full-width row (not squeezed into a table cell) so the bars and labels
 * are actually legible.
 *
 * When a same-month invoice from a year earlier exists, it's shown as a
 * muted pair of bars right next to that period's bars, for a direct
 * year-over-year comparison — most stores don't have a second year of
 * history yet, so this simply doesn't render until they do.
 */
export function ProductComparisonChart({ points }: { points: ComparisonPoint[] }) {
  if (points.length === 0) {
    return <span className="text-sm text-gray-400">No history</span>;
  }

  const recent = points.slice(-RECENT_COUNT);
  const max = Math.max(
    1,
    ...recent.flatMap((p) => [p.delivered, p.sold, p.priorYear?.delivered ?? 0, p.priorYear?.sold ?? 0])
  );

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
            <div className="flex flex-1 items-end gap-3">
              {p.priorYear && (
                <div className="flex items-end gap-2 border-r border-gray-200 pr-3">
                  <Bar
                    value={p.priorYear.delivered}
                    height={Math.max(3, Math.round((p.priorYear.delivered / max) * CHART_HEIGHT_PX))}
                    color={DELIVERED_COLOR}
                    muted
                  />
                  <Bar
                    value={p.priorYear.sold}
                    height={Math.max(3, Math.round((p.priorYear.sold / max) * CHART_HEIGHT_PX))}
                    color={SOLD_COLOR}
                    muted
                  />
                </div>
              )}
              <div className="flex items-end gap-2">
                <Bar value={p.delivered} height={deliveredHeight} color={DELIVERED_COLOR} />
                <Bar value={p.sold} height={soldHeight} color={SOLD_COLOR} />
              </div>
            </div>
            <div className="mt-2 whitespace-nowrap text-xs text-gray-500">{p.dateLabel}</div>
            {p.priorYear && <div className="whitespace-nowrap text-[10px] text-gray-400">vs last year</div>}
          </div>
        );
      })}
    </div>
  );
}
