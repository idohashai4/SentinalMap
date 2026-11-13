import { X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-[10000] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map(({ id, title, description, variant }) => (
        <div
          key={id}
          dir="auto"
          className={`flex items-start gap-3 rounded-md border p-4 shadow-lg ${
            variant === "destructive"
              ? "border-destructive bg-destructive text-destructive-foreground"
              : "border-border bg-card text-foreground"
          }`}
        >
          <div className="flex-1 min-w-0">
            {title && <p className="text-sm font-semibold">{title}</p>}
            {description && <p className="text-sm opacity-90 break-words">{description}</p>}
          </div>
          <button onClick={() => dismiss(id)} aria-label="סגור" className="opacity-60 hover:opacity-100 transition-opacity">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
