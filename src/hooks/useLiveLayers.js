import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEarthquakes, fetchNaturalEvents } from "@/lib/liveFeeds";
import { fetchMonitorSituationConflicts } from "@/lib/monitorSituationFeed";

const EMPTY = { quakes: false, nature: false, mts: false };
const AUTO_REFRESH_MS = 5 * 60 * 1000;

export default function useLiveLayers() {
  const [enabled, setEnabled] = useState(EMPTY);
  const [items, setItems] = useState({ quakes: [], nature: [], mts: [] });
  const [loading, setLoading] = useState(EMPTY);
  const [error, setError] = useState({ quakes: null, nature: null, mts: null });
  const [updatedAt, setUpdatedAt] = useState({ quakes: null, nature: null, mts: null });

  const areaRef = useRef({});

  const load = useCallback(async (groupId, area) => {
    areaRef.current[groupId] = area;
    setLoading((p) => ({ ...p, [groupId]: true }));
    setError((p) => ({ ...p, [groupId]: null }));
    try {
      const data =
        groupId === "quakes"
          ? await fetchEarthquakes()
          : groupId === "nature"
            ? await fetchNaturalEvents()
            : await fetchMonitorSituationConflicts(area);
      setItems((p) => ({ ...p, [groupId]: data }));
      setUpdatedAt((p) => ({ ...p, [groupId]: new Date().toISOString() }));
    } catch (e) {
      setError((p) => ({ ...p, [groupId]: "טעינת הנתונים נכשלה. נסה שוב." }));
    } finally {
      setLoading((p) => ({ ...p, [groupId]: false }));
    }
  }, []);

  const toggle = useCallback(
    (groupId, area) => {
      const next = !enabled[groupId];
      setEnabled((p) => ({ ...p, [groupId]: next }));
      if (next) load(groupId, area);
    },
    [enabled, load]
  );

  const refresh = useCallback((groupId, area) => load(groupId, area), [load]);

  // Keep switched-on feeds current without the user pressing refresh.
  useEffect(() => {
    const active = Object.keys(enabled).filter((id) => enabled[id]);
    if (!active.length) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      active.forEach((id) => load(id, areaRef.current[id]));
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, load]);

  return { enabled, items, loading, error, updatedAt, toggle, refresh };
}
