import React, { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { geocodeLocation } from "@/lib/geocode";
import { useToast } from "@/components/ui/use-toast";
import ColorPicker from "./ColorPicker";

const SIZES = [
  { id: "small", label: "קטן" },
  { id: "medium", label: "בינוני" },
  { id: "large", label: "גדול" },
];

const inputCls =
  "w-full bg-muted/50 border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary/60";

// Free-text place names drawn on the map.
export default function PlaceLabelsPanel({ labels = [], onChanged }) {
  const [form, setForm] = useState({ name: "", latitude: "", longitude: "", color: "#facc15", font_size: "medium" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const locate = async () => {
    if (!form.name.trim()) return;
    const coords = await geocodeLocation(form.name).catch(() => null);
    if (coords) setForm((f) => ({ ...f, latitude: String(coords.lat), longitude: String(coords.lng) }));
    else toast({ title: "לא נמצא", description: "הזן קואורדינטות ידנית.", variant: "destructive" });
  };

  const add = async (e) => {
    e.preventDefault();
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (!form.name.trim() || isNaN(lat) || isNaN(lng)) {
      toast({ title: "חסרים פרטים", description: "נדרשים שם וקואורדינטות.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.entities.place_labels.create({ name: form.name.trim(), latitude: lat, longitude: lng, color: form.color, font_size: form.font_size });
      setForm((f) => ({ ...f, name: "", latitude: "", longitude: "" }));
      onChanged?.();
    } catch (err) {
      toast({ title: "השמירה נכשלה", description: "נסה שוב.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    await base44.entities.place_labels.delete(id);
    onChanged?.();
  };

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="space-y-2">
        <div className="flex gap-2">
          <input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="שם המקום" className={inputCls} dir="auto" />
          <button type="button" onClick={locate} className="shrink-0 px-2.5 rounded-md bg-secondary text-secondary-foreground text-xs font-mono hover:bg-secondary/80">איתור</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" step="any" value={form.latitude} onChange={(e) => update("latitude", e.target.value)} placeholder="Latitude" className={inputCls} />
          <input type="number" step="any" value={form.longitude} onChange={(e) => update("longitude", e.target.value)} placeholder="Longitude" className={inputCls} />
        </div>
        <div className="flex items-center gap-2">
          <ColorPicker value={form.color} onChange={(c) => update("color", c)} />
          <select value={form.font_size} onChange={(e) => update("font_size", e.target.value)} className={`${inputCls} w-auto ml-auto`}>
            {SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <button type="submit" disabled={saving}
          className="w-full h-9 rounded-md bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-mono font-semibold flex items-center justify-center gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} הוסף תווית
        </button>
      </form>

      <div className="space-y-1 max-h-56 overflow-y-auto">
        {labels.length === 0 && <p className="text-[10px] font-mono text-foreground/60 italic px-1">אין תוויות</p>}
        {labels.map((l) => (
          <div key={l.id} className="group flex items-center gap-2 px-2 py-1 rounded-md bg-muted/20 border border-border/40">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color || "#facc15" }} />
            <span className="flex-1 truncate text-[11px] font-mono text-foreground" dir="auto">{l.name}</span>
            <button onClick={() => remove(l.id)} title="מחק תווית"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground/60 hover:text-red-400 transition-all">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
