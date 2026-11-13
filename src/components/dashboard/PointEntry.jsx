import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Crosshair } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { geocodeLocation } from "@/lib/geocode";
import { useToast } from "@/components/ui/use-toast";
import ColorPicker from "./ColorPicker";
import MapPinPicker from "./MapPinPicker";

const NEW_TOPIC = "__new__";

const EMPTY = {
  title: "",
  topic: "",
  event_date: "",
  latitude: "",
  longitude: "",
  description: "",
  marker_color: "#3b82f6",
  media_url: "",
  tags: ""
};

export default function PointEntry({ topics = [], mapCenter, onCreated, onTopicCreated }) {
  const [form, setForm] = useState({ ...EMPTY, topic: topics[0]?.name || NEW_TOPIC });
  const [newTopic, setNewTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPinPicker, setShowPinPicker] = useState(false);
  const { toast } = useToast();

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleGeocode = async () => {
    if (!form.title.trim()) return;
    const coords = await geocodeLocation(form.title);
    if (coords) {
      setForm((f) => ({ ...f, latitude: String(coords.lat), longitude: String(coords.lng) }));
      toast({ title: "נמצא מיקום", description: `${coords.lat}, ${coords.lng}` });
    } else {
      toast({ title: "לא נמצא", description: "הזן קואורדינטות ידנית או סמן על המפה.", variant: "destructive" });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "חסר שם", description: "יש להזין שם לנקודת העניין.", variant: "destructive" });
      return;
    }

    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      toast({ title: "חסר מיקום", description: "הזן קואורדינטות או סמן נקודה על המפה.", variant: "destructive" });
      return;
    }

    setSaving(true);

    let topicName = form.topic;
    if (form.topic === NEW_TOPIC) {
      topicName = newTopic.trim();
      if (!topicName) {
        toast({ title: "חסר שם נושא", description: "הזן שם לתיקייה החדשה.", variant: "destructive" });
        setSaving(false);
        return;
      }
      if (!topics.some((t) => t.name === topicName)) {
        await base44.entities.poi_topics.create({ name: topicName, color: form.marker_color });
        onTopicCreated?.();
      }
    }

    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);

    await base44.entities.points_of_interest.create({
      title: form.title.trim(),
      topic: topicName || "כללי",
      event_date: form.event_date || new Date().toISOString(),
      latitude: lat,
      longitude: lng,
      description: form.description,
      marker_color: form.marker_color,
      media_url: form.media_url || null,
      tags: tags.length ? tags : null
    });

    toast({ title: "נקודת עניין נוספה", description: form.title });
    setForm({ ...EMPTY, topic: topicName || NEW_TOPIC });
    setNewTopic("");
    setSaving(false);
    onCreated();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">שם נקודת העניין *</Label>
        <div className="flex gap-2">
          <Input
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="למשל: מוצב, אתר, מקום עניין..."
            className="bg-muted/50 border-border text-sm flex-1"
          />
          <Button type="button" variant="secondary" size="sm" onClick={handleGeocode} className="text-xs font-mono shrink-0">
            איתור
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">נושא / תיקייה</Label>
        <select
          value={form.topic}
          onChange={(e) => update("topic", e.target.value)}
          className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/60"
        >
          {topics.map((t) => (
            <option key={t.id} value={t.name}>{t.name}</option>
          ))}
          <option value={NEW_TOPIC}>+ צור נושא חדש...</option>
        </select>
        {form.topic === NEW_TOPIC && (
          <Input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="שם הנושא החדש"
            className="bg-muted/50 border-border text-sm mt-2"
          />
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">תאריך ושעה</Label>
        <Input
          type="datetime-local"
          value={form.event_date}
          onChange={(e) => update("event_date", e.target.value)}
          className="bg-muted/50 border-border text-sm font-mono"
        />
      </div>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setShowPinPicker(true)}
        className="w-full text-xs font-mono gap-1.5 border border-dashed border-border hover:border-primary/50 hover:text-primary transition-colors"
      >
        <Crosshair className="w-3.5 h-3.5" />
        סמן מיקום על המפה
      </Button>

      {showPinPicker && (
        <MapPinPicker
          color={form.marker_color}
          center={mapCenter}
          onConfirm={(coords) => setForm((f) => ({ ...f, latitude: String(coords.lat.toFixed(6)), longitude: String(coords.lng.toFixed(6)) }))}
          onClose={() => setShowPinPicker(false)}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Latitude</Label>
          <Input
            type="number"
            step="any"
            value={form.latitude}
            onChange={(e) => update("latitude", e.target.value)}
            placeholder="33.2721"
            className="bg-muted/50 border-border text-sm font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Longitude</Label>
          <Input
            type="number"
            step="any"
            value={form.longitude}
            onChange={(e) => update("longitude", e.target.value)}
            placeholder="35.2033"
            className="bg-muted/50 border-border text-sm font-mono"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">תיאור</Label>
        <Textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="תיאור חופשי של נקודת העניין..."
          className="bg-muted/50 border-border text-sm min-h-[70px] resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">קישור למדיה (אופציונלי)</Label>
        <Input
          type="url"
          value={form.media_url}
          onChange={(e) => update("media_url", e.target.value)}
          placeholder="https://..."
          className="bg-muted/50 border-border text-sm font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">תגיות (מופרד בפסיק)</Label>
        <Input
          value={form.tags}
          onChange={(e) => update("tags", e.target.value)}
          placeholder="תגית1, תגית2"
          className="bg-muted/50 border-border text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">צבע מרקר</Label>
        <ColorPicker value={form.marker_color} onChange={(c) => update("marker_color", c)} />
      </div>

      <Button
        type="submit"
        disabled={saving}
        className="w-full bg-primary hover:bg-primary/90 font-mono uppercase tracking-wider text-xs h-10"
      >
        {saving ? (
          <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> שומר...</>
        ) : (
          <><Plus className="w-3.5 h-3.5 mr-2" /> הוסף נקודת עניין</>
        )}
      </Button>
    </form>
  );
}
