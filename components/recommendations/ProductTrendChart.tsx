export interface TrendPoint {
  dateLabel: string;
  sold: number;
}

const WIDTH = 200;
const HEIGHT = 40;
const PADDING = 4;

/**
 * A compact sold-quantity trend line across a store's full invoice
 * history for one product — plain SVG, no charting library, matching
 * the rest of the app. Hover on a point shows its date/quantity via a
 * native SVG <title>, so no client component/JS is needed for that.
 */
export function ProductTrendChart({ points, color }: { points: TrendPoint[]; color: string }) {
  if (points.length === 0) {
    return <span className="text-xs text-gray-400">No history</span>;
  }
  if (points.length === 1) {
    return (
      <span className="text-xs text-gray-500" title={`${points[0].dateLabel}: ${points[0].sold}`}>
        Only 1 invoice so far
      </span>
    );
  }

  const max = Math.max(1, ...points.map((p) => p.sold));
  const stepX = (WIDTH - PADDING * 2) / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: PADDING + i * stepX,
    y: HEIGHT - PADDING - (p.sold / max) * (HEIGHT - PADDING * 2),
    ...p,
  }));
  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="h-10 w-full min-w-[8rem]"
    >
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={2} fill={color}>
          <title>{`${c.dateLabel}: ${c.sold} sold`}</title>
        </circle>
      ))}
    </svg>
  );
}
