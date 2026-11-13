import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe2, MapPin, Tag, Clock, Activity } from "lucide-react";

import ThreatMap from "@/components/dashboard/ThreatMap";
import PointEntry from "@/components/dashboard/PointEntry";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import PanelSection from "@/components/dashboard/PanelSection";
import PlaceLabelsPanel from "@/components/dashboard/PlaceLabelsPanel";
import PointTimeline from "@/components/dashboard/PointTimeline";
import LayersPanel from "@/components/dashboard/LayersPanel";
import TopicsPanel from "@/components/dashboard/TopicsPanel";
import LiveLayersPanel from "@/components/dashboard/LiveLayersPanel";
import LiveReportPanel from "@/components/dashboard/LiveReportPanel";
import useLiveLayers from "@/hooks/useLiveLayers";
import { fetchEventSourceUrl } from "@/lib/monitorSituationFeed";
import { LIVE_COLORS, LIVE_TOPIC } from "@/lib/liveFeeds";
import { useToast } from "@/components/ui/use-toast";

const SHAPES_LIMIT = 2000;

const fetchAllShapes = async () => {
  const shapes = await base44.entities.map_shapes.list("-created_date", SHAPES_LIMIT);
  return Array.isArray(shapes) ? shapes : shapes?.items || [];
};

export default function Dashboard() {
  const [focusCoords, setFocusCoords] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  const [visibleTopics, setVisibleTopics] = useState({});
  const [visibleLayers, setVisibleLayers] = useState({});
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [reportItem, setReportItem] = useState(null);
  const [mapScalePct, setMapScalePct] = useState(90);
  const [customLayerNames, setCustomLayerNames] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("map_layer_names") || "[]");
      const cleaned = stored.filter((n) => n !== "IRAN Bases" && n !== "LAF" && n !== "Global" && n !== "military Bases" && n !== "Energy" && n !== "Strategic Infrastructure");
      if (cleaned.length !== stored.length) localStorage.setItem("map_layer_names", JSON.stringify(cleaned));
      return cleaned;
    } catch {return [];}
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const live = useLiveLayers();
  const [savedLiveIds, setSavedLiveIds] = useState(() => {
    try {return JSON.parse(localStorage.getItem("live_saved_ids") || "[]");} catch {return [];}
  });
  const [savedLiveMap, setSavedLiveMap] = useState(() => {
    try {return JSON.parse(localStorage.getItem("live_saved_map") || "{}");} catch {return {};}
  });

  const handleToggleTopic = (name) => {
    // Topics start hidden; the first click shows them.
    setVisibleTopics((prev) => ({ ...prev, [name]: prev[name] !== true }));
  };

  const handleTopicRenamed = (oldName, newName) => {
    setVisibleTopics((prev) => {
      if (!(oldName in prev)) return prev;
      const next = { ...prev, [newName]: prev[oldName] };
      delete next[oldName];
      return next;
    });
  };

  const handleToggleLayer = (name) => {
    setVisibleLayers((prev) => ({ ...prev, [name]: prev[name] === false ? true : false }));
  };

  const { data: pois = [], isLoading } = useQuery({
    queryKey: ["points_of_interest"],
    queryFn: () => base44.entities.points_of_interest.list("-event_date", 500)
  });

  const { data: topics = [] } = useQuery({
    queryKey: ["poi_topics"],
    queryFn: () => base44.entities.poi_topics.list("-created_date", 100)
  });

  const { data: shapes = [] } = useQuery({
    queryKey: ["map_shapes"],
    queryFn: () => fetchAllShapes()
  });

  const { data: placeLabels = [] } = useQuery({
    queryKey: ["place_labels"],
    queryFn: () => base44.entities.place_labels.list("-created_date", 200)
  });

  const refreshPoints = () => queryClient.invalidateQueries({ queryKey: ["points_of_interest"] });
  const refreshTopics = () => queryClient.invalidateQueries({ queryKey: ["poi_topics"] });
  const refreshLabels = () => queryClient.invalidateQueries({ queryKey: ["place_labels"] });
  const refreshShapes = () => queryClient.invalidateQueries({ queryKey: ["map_shapes"] });

  // Put the freshly saved shape straight into the cache so the map and the layers
  // list update immediately, instead of waiting for the background re-fetch.
  const handleShapeAdded = (created) => {
    if (created && created.id) {
      queryClient.setQueryData(["map_shapes"], (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return [created, ...list.filter((s) => s.id !== created.id)];
      });
      const layer = created.layer_name || "default";
      setVisibleLayers((prev) => (prev[layer] === false ? { ...prev, [layer]: true } : prev));
    }
    refreshShapes();
  };

  const handleRevealLayer = (name) => {
    setVisibleLayers((prev) => (prev[name] === false ? { ...prev, [name]: true } : prev));
  };

  const handleSelectPoint = (poi) => {
    if (poi.latitude && poi.longitude) {
      setFocusCoords({ lat: poi.latitude, lng: poi.longitude });
    }
  };

  const handleShapeDeleted = async (id) => {
    await base44.entities.map_shapes.delete(id);
    refreshShapes();
  };

  const handleShapeEdited = async (id, data) => {
    await base44.entities.map_shapes.update(id, data);
    refreshShapes();
  };

  const handleDeleteLayer = async (name) => {
    await base44.entities.map_shapes.deleteMany({ layer_name: name });
    refreshShapes();
  };

  const handleFocusLive = (item) => setFocusCoords({ lat: item.lat, lng: item.lon });

  const handleSaveLive = async (item) => {
    if (savedLiveIds.includes(item.id)) return;
    if (!topics.some((t) => t.name === LIVE_TOPIC)) {
      await base44.entities.poi_topics.create({ name: LIVE_TOPIC, color: "#a855f7" });
      refreshTopics();
    }
    setVisibleTopics((prev) => ({ ...prev, [LIVE_TOPIC]: true }));
    const sourceUrl = item.sourceUrl || (await fetchEventSourceUrl(item.eventId).catch(() => null))?.url || "";
    const created = await base44.entities.points_of_interest.create({
      title: item.title,
      topic: LIVE_TOPIC,
      event_date: item.time || new Date().toISOString(),
      latitude: item.lat,
      longitude: item.lon,
      description: [item.detail, item.summary, item.sourceName ? `מקור: ${item.sourceName}` : ""].
      filter(Boolean).
      join(" · "),
      marker_color: LIVE_COLORS[item.group] || "#a855f7",
      media_url: sourceUrl,
      tags: [item.sourceName].filter(Boolean)
    });
    const next = [...savedLiveIds, item.id];
    setSavedLiveIds(next);
    localStorage.setItem("live_saved_ids", JSON.stringify(next));
    const nextMap = { ...savedLiveMap, [item.id]: created.id };
    setSavedLiveMap(nextMap);
    localStorage.setItem("live_saved_map", JSON.stringify(nextMap));
    refreshPoints();
    toast({ title: "נשמר כנקודת מחקר", description: item.title });
  };

  const handleUnsaveLive = async (item) => {
    const poiId = savedLiveMap[item.id] ||
    pois.find((p) => p.topic === LIVE_TOPIC && p.title === item.title)?.id;
    if (poiId) await base44.entities.points_of_interest.delete(poiId);
    const nextIds = savedLiveIds.filter((id) => id !== item.id);
    setSavedLiveIds(nextIds);
    localStorage.setItem("live_saved_ids", JSON.stringify(nextIds));
    const nextMap = { ...savedLiveMap };
    delete nextMap[item.id];
    setSavedLiveMap(nextMap);
    localStorage.setItem("live_saved_map", JSON.stringify(nextMap));
    refreshPoints();
    toast({ title: "נקודת המחקר נמחקה", description: item.title });
  };

  const handlePoiDelete = async (id) => {
    await base44.entities.points_of_interest.delete(id);
    refreshPoints();
    toast({ title: "הנקודה נמחקה", duration: 2000 });
  };

  // Stable identity: a new array on every render made the map rebuild its live
  // markers (and close the popup the user just opened) after any state change.
  const activeLiveItems = useMemo(() => Object.entries(live.enabled).flatMap(([group, on]) =>
  on ? live.items[group] || [] : []
  ), [live.enabled, live.items]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card/80 backdrop-blur-sm px-4 lg:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Globe2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm lg:text-base font-bold font-mono uppercase tracking-wider text-foreground">
              מפת המחקר שלי
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              World Research Map · נקודות עניין ונושאים
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-chart-3 animate-pulse" />
          <span className="text-xs font-mono text-muted-foreground hidden sm:inline">SYSTEM ACTIVE</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Map Panel - 60% */}
        <div className={mapFullscreen ?
        "fixed inset-0 z-[2000] p-2 bg-background flex flex-col" :
        "h-[45vh] lg:h-full lg:w-[60%] p-2 lg:p-3"}>
          <div className={mapFullscreen ? "flex items-center justify-between gap-2 mb-2 shrink-0 px-1" : "hidden"}>
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">מפה במסך מלא</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground">גודל</span>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={mapScalePct}
                  onChange={(e) => setMapScalePct(Number(e.target.value))}
                  className="w-28 accent-primary" />
                
                <span className="text-[10px] font-mono text-muted-foreground w-8">{mapScalePct}%</span>
              </div>
              <button
                onClick={() => setMapFullscreen(false)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                
                יציאה
              </button>
            </div>
          </div>
          <div className={mapFullscreen ? "flex-1 flex items-center justify-center min-h-0" : "w-full h-full"}>
            <div
              className={mapFullscreen ? "w-full" : "w-full h-full"}
              style={mapFullscreen ? { height: `${mapScalePct}%` } : undefined}>
              
              {isLoading ?
              <div className="w-full h-full rounded-lg bg-muted/20 border border-border flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-muted-foreground border-t-primary rounded-full animate-spin" />
                </div> :

              <ThreatMap
                pois={pois}
                topics={topics}
                visibleTopics={visibleTopics}
                focusCoords={focusCoords}
                shapes={shapes}
                placeLabels={placeLabels}
                onShapeAdded={handleShapeAdded}
                onRevealLayer={handleRevealLayer}
                onShapeDeleted={handleShapeDeleted}
                onShapeEdited={handleShapeEdited}
                visibleLayers={visibleLayers}
                onToggleLayer={handleToggleLayer}
                onDeleteLayer={handleDeleteLayer}
                isFullscreen={mapFullscreen}
                onToggleFullscreen={() => setMapFullscreen((f) => !f)}
                customLayerNames={customLayerNames}
                onLayerNamesChange={setCustomLayerNames}
                liveItems={activeLiveItems}
                savedLiveIds={savedLiveIds}
                onLiveSave={handleSaveLive}
                onLiveDetails={setReportItem}
                onPoiDelete={handlePoiDelete}
                onCenterChange={setMapCenter} />

              }
            </div>
          </div>
        </div>

        {/* Control Panel - 40% */}
        <div className="flex-1 lg:w-[40%] border-t lg:border-t-0 lg:border-l border-border flex flex-col overflow-hidden bg-gradient-to-b from-card/40 via-background to-background">
          <div className="shrink-0 px-3 lg:px-4 py-3 border-b border-border/70 bg-card/50 backdrop-blur-sm flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-primary/10 border border-primary/20">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] [font-family:'Abril_Fatface',_system-ui] text-[hsl(var(--foreground))]">מסוף מחקר</h2>
              
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted/40 text-muted-foreground shrink-0 [font-family:'Helvetica_Bold',_sans-serif] font-bold">
              {pois.length} רשומות
            </span>
          </div>
          <div className="p-3 lg:p-4 space-y-4 overflow-y-auto flex-1">
            <TopicsPanel
              topics={topics}
              pois={pois}
              visibleTopics={visibleTopics}
              onToggleTopic={handleToggleTopic}
              onRenamed={handleTopicRenamed}
              onChanged={() => {refreshTopics();refreshPoints();}} />
            

            <LiveLayersPanel
              live={live}
              savedIds={savedLiveIds}
              onFocus={handleFocusLive}
              onSave={handleSaveLive}
              onUnsave={handleUnsaveLive}
              onDetails={setReportItem} />
            

            <div className="lg:hidden">
              <LayersPanel
                shapes={shapes}
                visibleLayers={visibleLayers}
                onToggleLayer={handleToggleLayer}
                onDeleteLayer={handleDeleteLayer}
                onLayerNamesChange={setCustomLayerNames} />
              
            </div>

            <PanelSection icon={MapPin} title="הוספה וחקר" bodyClassName="p-0">
              <Tabs defaultValue="point" className="w-full">
                <TabsList className="w-full h-auto p-1 bg-muted/30 border-b border-border/60 rounded-none gap-1">
                  <TabsTrigger value="point" className="flex-1 font-mono text-[10px] uppercase tracking-wider gap-1.5 rounded-md py-1.5 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                    <MapPin className="w-3 h-3" /> נקודה
                  </TabsTrigger>
                  <TabsTrigger value="labels" className="flex-1 font-mono text-[10px] uppercase tracking-wider gap-1.5 rounded-md py-1.5 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                    <Tag className="w-3 h-3" /> תוויות
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="flex-1 font-mono text-[10px] uppercase tracking-wider gap-1.5 rounded-md py-1.5 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                    <Clock className="w-3 h-3" /> ציר זמן
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="point" className="mt-0 p-3">
                  <PointEntry
                    topics={topics}
                    mapCenter={mapCenter || (focusCoords ? focusCoords : null)}
                    onCreated={refreshPoints}
                    onTopicCreated={refreshTopics} />
                  
                </TabsContent>
                <TabsContent value="labels" className="mt-0 p-3">
                  <PlaceLabelsPanel labels={placeLabels} onChanged={refreshLabels} />
                </TabsContent>
                <TabsContent value="timeline" className="mt-0 p-3">
                  <PointTimeline pois={pois} onFocus={handleSelectPoint} />
                </TabsContent>
              </Tabs>
            </PanelSection>

            <PanelSection icon={Clock} title="נקודות אחרונות" accent="chart4" bodyClassName="p-2.5">
              <ActivityFeed
                pois={pois}
                topics={topics}
                onSelectPoint={handleSelectPoint}
                onChanged={refreshPoints} />
              
            </PanelSection>
          </div>
        </div>
      </div>

      {reportItem && <LiveReportPanel item={reportItem} onClose={() => setReportItem(null)} />}
    </div>);

}
