import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus } from "lucide-react";

const KINDS = [
  { id: "text", label: "מלל" },
  { id: "link", label: "קישור" },
  { id: "image", label: "תמונה" }
];

export default function LayerNoteForm({ shapeId, layerName, onAdded }) {
  const [kind, setKind] = useState("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const canSave = kind === "text" ? text.trim().length > 0 : url.trim().length > 0;

  const submit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await base44.entities.layer_notes.create({
        shape_id: shapeId,
        layer_name: layerName,
        kind,
        title: title.trim(),
        text: kind === "text" ? text.trim() : "",
        url: kind === "text" ? "" : url.trim()
      });
      setTitle("");
      setText("");
      setUrl("");
      onAdded();
    } catch (e) {
      toast({ title: "השמירה נכשלה", description: "נסה שוב.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[11px] font-mono text-white placeholder-white/25 focus:outline-none focus:border-white/30";

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {KINDS.map(k => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`flex-1 py-1 rounded text-[10px] font-mono border transition-all ${
              kind === k.id
                ? "bg-cyan-500 text-black border-cyan-400"
                : "bg-white/5 text-white/50 border-white/10 hover:text-white/80"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder={kind === "image" ? "כיתוב לתמונה..." : kind === "link" ? "שם הקישור..." : "כותרת (לא חובה)..."}
        className={inputCls}
        dir="auto"
      />

      {kind === "text" ? (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          placeholder="המלל שתרצה לשמור..."
          className={`${inputCls} resize-none leading-relaxed`}
          dir="auto"
        />
      ) : (
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder={kind === "image" ? "https://... כתובת התמונה" : "https://... כתובת הקישור"}
          className={inputCls}
          dir="ltr"
        />
      )}

      <button
        onClick={submit}
        disabled={!canSave || saving}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-mono font-semibold bg-cyan-500 text-black hover:bg-cyan-400 disabled:bg-white/5 disabled:text-white/25 transition-all"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {saving ? "שומר..." : "הוסף מידע"}
      </button>
    </div>
  );
}
