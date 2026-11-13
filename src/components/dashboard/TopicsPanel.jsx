import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Folder, Eye, EyeOff, Plus, Trash2, AlertCircle, X, Pencil, Save, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PanelSection from "./PanelSection";

export default function TopicsPanel({ topics = [], pois = [], visibleTopics = {}, onToggleTopic, onRenamed, onChanged, className = "" }) {
  const [newName, setNewName] = useState("");
  const [confirmTopic, setConfirmTopic] = useState(null);
  const [renameTopic, setRenameTopic] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const { toast } = useToast();

  const openRename = (topic) => {
    setRenameTopic(topic);
    setRenameValue(topic.name);
  };

  const saveRename = async () => {
    const name = renameValue.trim();
    if (!renameTopic) return;
    if (!name || name === renameTopic.name) { setRenameTopic(null); return; }
    setRenaming(true);
    await base44.entities.poi_topics.update(renameTopic.id, { name });
    await base44.entities.points_of_interest.updateMany({ topic: renameTopic.name }, { $set: { topic: name } });
    onRenamed?.(renameTopic.name, name);
    toast({ title: "שם התיקייה עודכן", description: name });
    setRenaming(false);
    setRenameTopic(null);
    onChanged?.();
  };

  const addTopic = async () => {
    const name = newName.trim();
    if (!name || topics.some((t) => t.name === name)) return;
    await base44.entities.poi_topics.create({ name });
    setNewName("");
    toast({ title: "נושא נוצר", description: name });
    onChanged?.();
  };

  const deleteTopic = async () => {
    if (!confirmTopic) return;
    await base44.entities.points_of_interest.deleteMany({ topic: confirmTopic.name });
    await base44.entities.poi_topics.delete(confirmTopic.id);
    toast({ title: "נושא נמחק", description: `${confirmTopic.name} וכל הנקודות שבו הוסרו.` });
    setConfirmTopic(null);
    onChanged?.();
  };

  return (
    <PanelSection
      icon={Folder}
      title="נושאים / תיקיות"
      accent="chart2"
      className={className}
      action={<span className="text-[10px] font-mono font-semibold text-foreground/75">{topics.length}</span>}
      bodyClassName="p-2.5 space-y-2"
    >
      <div className="space-y-1">
        {topics.length === 0 && (
          <p className="text-[10px] font-mono text-foreground/60 italic px-1 py-1">אין נושאים</p>
        )}
        {topics.map((t) => {
          const isVisible = visibleTopics[t.name] === true;
          const count = pois.filter((p) => (p.topic || "כללי") === t.name).length;
          const dot = t.color || "#3b82f6";
          return (
            <div key={t.id} className="flex items-center gap-1 group">
              <button
                onClick={() => onToggleTopic?.(t.name)}
                className={`flex-1 flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md border transition-all text-[11px] font-mono ${
                  isVisible
                    ? "bg-primary/10 border-primary/30 text-foreground shadow-sm shadow-primary/10"
                    : "bg-muted/20 border-transparent text-foreground/75 hover:bg-muted/40"
                }`}
              >
                {isVisible
                  ? <Eye className="w-3 h-3 shrink-0 text-primary" />
                  : <EyeOff className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                }
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: dot, boxShadow: isVisible ? `0 0 6px ${dot}` : "none" }}
                />
                <span className="truncate">{t.name}</span>
                {count > 0 && <span className="ml-auto text-[10px] font-semibold text-foreground/65">{count}</span>}
              </button>
              <button
                onClick={() => openRename(t)}
                title="שנה שם תיקייה"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-primary transition-all p-1"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={() => setConfirmTopic(t)}
                title="מחק נושא"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-red-400 transition-all p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-1">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTopic()}
          placeholder="נושא חדש..."
          className="flex-1 bg-muted/40 border border-border rounded-md px-2 py-1.5 text-[10px] font-mono text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary/50 min-w-0"
        />
        <button
          onClick={addTopic}
          className="px-2 rounded-md bg-muted/60 hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-all"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {renameTopic && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRenameTopic(null)} />
          <div className="relative z-10 bg-[#0f172a] border border-white/10 rounded-xl p-5 w-80 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Pencil className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-mono font-bold text-white">שינוי שם תיקייה</h3>
              <button onClick={() => setRenameTopic(null)} className="ml-auto text-white/40 hover:text-white/80">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveRename()}
              autoFocus
              className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-primary/60 mb-1"
            />
            <p className="text-[10px] font-mono text-white/45 mb-4">כל הנקודות בתיקייה יועברו לשם החדש.</p>
            <div className="flex gap-2">
              <button onClick={() => setRenameTopic(null)} className="flex-1 py-2 rounded-md bg-white/5 text-white/60 text-xs font-mono hover:bg-white/10 transition-colors">ביטול</button>
              <button
                onClick={saveRename}
                disabled={renaming}
                className="flex-1 py-2 rounded-md bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-mono font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                {renaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} שמור
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmTopic && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmTopic(null)} />
          <div className="relative z-10 bg-[#0f172a] border border-white/10 rounded-xl p-5 w-80 shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-mono font-bold text-white">מחיקת נושא?</h3>
              <button onClick={() => setConfirmTopic(null)} className="ml-auto text-white/40 hover:text-white/80">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-white/50 font-mono mb-5">
              הנושא "{confirmTopic.name}" וכל נקודות העניין שבו יימחקו לצמיתות.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmTopic(null)} className="flex-1 py-2 rounded-md bg-white/5 text-white/60 text-xs font-mono hover:bg-white/10 transition-colors">ביטול</button>
              <button onClick={deleteTopic} className="flex-1 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-semibold transition-colors">מחק</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </PanelSection>
  );
}
