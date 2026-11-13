import React, { useMemo } from "react";
import { format } from "date-fns";

// Points in chronological order, grouped by day; click to fly to a point.
export default function PointTimeline({ pois = [], onFocus }) {
  const days = useMemo(() => {
    const dated = pois
      .filter((p) => p.event_date && !Number.isNaN(new Date(p.event_date).getTime()))
      .sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
    const groups = [];
    dated.forEach((p) => {
      const day = format(new Date(p.event_date), "dd MMM yyyy");
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(p);
      else groups.push({ day, items: [p] });
    });
    return groups;
  }, [pois]);

  if (days.length === 0) {
    return <p className="text-[11px] font-mono text-foreground/60 italic py-4 text-center">אין נקודות עם תאריך</p>;
  }

  return (
    <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3">
      {days.map((group) => (
        <div key={group.day}>
          <p className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground mb-1">{group.day}</p>
          <ol className="border-l border-border/70 ml-1.5 space-y-1.5">
            {group.items.map((p) => (
              <li key={p.id} className="relative pl-4">
                <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border border-background" style={{ background: p.marker_color || "#3b82f6" }} />
                <button onClick={() => onFocus?.(p)} className="w-full text-left rounded-md px-2 py-1 hover:bg-muted/40 transition-colors">
                  <span className="text-[10px] font-mono text-muted-foreground">{format(new Date(p.event_date), "HH:mm")}</span>
                  <span className="block text-xs font-semibold text-foreground" dir="auto">{p.title}</span>
                  {p.topic && <span className="block text-[10px] font-mono text-muted-foreground" dir="auto">{p.topic}</span>}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
