import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Save, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import ColorPicker from "./ColorPicker";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function PointEditDialog({ poi, topics = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    title: poi.title || "",
    topic: poi.topic || "כללי",
    event_date: poi.event_date ? poi.event_date.slice(0, 16) : "",
    description: poi.description || "",
    latitude: poi.latitude ?? "",
    longitude: poi.longitude ?? "",
    marker_color: poi.marker_color || "#3b82f6",
    media_url: poi.media_url || "",
    tags: Array.isArray(poi.tags) ? poi.tags.join(", ") : "",
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    await base44.entities.points_of_interest.update(poi.id, {
      title: form.title,
      topic: form.topic || "כללי",
      event_date: form.event_date || poi.event_date,
      description: form.description,
      latitude: isNaN(lat) ? null : lat,
      longitude: isNaN(lng) ? null : lng,
      marker_color: form.marker_color,
      media_url: form.media_url || null,
      tags: tags.length ? tags : null,
    });
    toast({ title: "הנקודה עודכנה", duration: 2000 });
    setSaving(false);
    onSaved();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-[#0f172a] border border-white/10 rounded-xl p-5 w-[420px] max-w-[95vw] shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-mono font-bold text-white">עריכת נקודת עניין</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">שם</Label>
          <Input value={form.title} onChange={(e) => update("title", e.target.value)} className="bg-muted/50 border-border text-sm" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">נושא / תיקייה</Label>
          <select
            value={form.topic}
            onChange={(e) => update("topic", e.target.value)}
            className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/60"
          >
            {!topics.some((t) => t.name === form.topic) && form.topic && (
              <option value={form.topic}>{form.topic}</option>
            )}
            {topics.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">תאריך ושעה</Label>
          <Input type="datetime-local" value={form.event_date} onChange={(e) => update("event_date", e.target.value)} className="bg-muted/50 border-border text-sm font-mono" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">תיאור</Label>
          <Textarea value={form.description} onChange={(e) => update("description", e.target.value)} className="bg-muted/50 border-border text-sm min-h-[70px] resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Latitude</Label>
            <Input type="number" step="any" value={form.latitude} onChange={(e) => update("latitude", e.target.value)} className="bg-muted/50 border-border text-sm font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Longitude</Label>
            <Input type="number" step="any" value={form.longitude} onChange={(e) => update("longitude", e.target.value)} className="bg-muted/50 border-border text-sm font-mono" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">קישור למדיה</Label>
          <Input type="url" value={form.media_url} onChange={(e) => update("media_url", e.target.value)} placeholder="https://..." className="bg-muted/50 border-border text-sm font-mono" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">תגיות (מופרד בפסיק)</Label>
          <Input value={form.tags} onChange={(e) => update("tags", e.target.value)} placeholder="תגית1, תגית2" className="bg-muted/50 border-border text-sm" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">צבע מרקר</Label>
          <ColorPicker value={form.marker_color} onChange={(c) => update("marker_color", c)} />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 rounded-md bg-primary hover:bg-primary/90 text-white text-xs font-mono font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> שומר...</> : <><Save className="w-3.5 h-3.5" /> שמור שינויים</>}
        </button>
      </div>
    </div>,
    document.body
  );
}
