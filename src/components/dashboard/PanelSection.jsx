import React from "react";

const ACCENTS = {
  primary: "text-primary bg-primary/10 border-primary/20",
  chart2: "text-chart-2 bg-chart-2/10 border-chart-2/20",
  chart3: "text-chart-3 bg-chart-3/10 border-chart-3/20",
  chart4: "text-chart-4 bg-chart-4/10 border-chart-4/20",
  chart5: "text-chart-5 bg-chart-5/10 border-chart-5/20",
};

// Titled card used for every block of the research console.
export default function PanelSection({ icon: Icon, title, accent = "primary", action, className = "", bodyClassName = "p-3", children }) {
  return (
    <section className={`rounded-lg border border-border/70 bg-card/60 overflow-hidden ${className}`}>
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/30">
        {Icon && (
          <span className={`p-1 rounded border ${ACCENTS[accent] || ACCENTS.primary}`}>
            <Icon className="w-3 h-3" />
          </span>
        )}
        <h3 className="flex-1 text-[11px] font-mono font-bold uppercase tracking-[0.14em] text-foreground">{title}</h3>
        {action}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
