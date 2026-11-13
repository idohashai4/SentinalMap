import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import { format } from "date-fns";
import { Satellite, Map, Globe, Maximize2, Minimize2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { ShapeSaveDialog, ShapeEditDialog } from "./ShapeDialog";
import LayersPanel from "./LayersPanel";
import LayerInfoPanel from "./LayerInfoPanel";
import TranslationTool from "./TranslationTool";
import ResearcherTool from "./ResearcherTool";
import LiveLayer from "./LiveLayer";
import { flagUrl } from "@/lib/flags";

function makeIcon(color = "#3b82f6") {
  return new L.DivIcon({
    className: "",
    html: `<div style="
      width: 14px; height: 14px;
      background: ${color};
      border: 2px solid ${color}99;
      border-radius: 50%;
      box-shadow: 0 0 10px ${color}88, 0 0 20px ${color}44;
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -12]
  });
}

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

// Flag patterns must live inside the map's own <svg> element, otherwise the fill
// reference (url(#flagfill-x)) has nothing to resolve against.
function ensureFlagPatterns(map, flagIds) {
  const pane = map.getPane("overlayPane");
  const svg = pane ? pane.querySelector("svg") : null;
  if (!svg) return;

  let defs = svg.querySelector("#flag-fill-defs");
  if (!defs) {
    defs = document.createElementNS(SVG_NS, "defs");
    defs.setAttribute("id", "flag-fill-defs");
    svg.insertBefore(defs, svg.firstChild);
  }

  const key = flagIds.join(",");
  if (defs.getAttribute("data-flags") === key) return;
  defs.setAttribute("data-flags", key);
  while (defs.firstChild) defs.removeChild(defs.firstChild);

  flagIds.forEach((id) => {
    const pattern = document.createElementNS(SVG_NS, "pattern");
    pattern.setAttribute("id", `flagfill-${id}`);
    pattern.setAttribute("patternUnits", "objectBoundingBox");
    pattern.setAttribute("patternContentUnits", "objectBoundingBox");
    pattern.setAttribute("width", "1");
    pattern.setAttribute("height", "1");

    const image = document.createElementNS(SVG_NS, "image");
    image.setAttribute("width", "1");
    image.setAttribute("height", "1");
    image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute("href", flagUrl(id, 640));
    image.setAttributeNS(XLINK_NS, "xlink:href", flagUrl(id, 640));

    pattern.appendChild(image);
    defs.appendChild(pattern);
  });
}

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function poiPopupHTML(poi, topicColor) {
  const color = poi.marker_color || topicColor || "#3b82f6";
  const date = poi.event_date ? format(new Date(poi.event_date), "dd MMM yyyy HH:mm") : "";
  return `
    <div style="min-width:200px;font-family:'JetBrains Mono',monospace">
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;text-transform:uppercase;color:${color}">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color}"></span>
        ${escapeHtml(poi.title)}
      </div>
      ${poi.topic ? `<div style="font-size:10px;color:#9ca3af;margin-top:3px">${escapeHtml(poi.topic)}</div>` : ""}
      ${date ? `<div style="font-size:11px;color:#9ca3af;margin-top:5px">${date}</div>` : ""}
      ${poi.description ? `<div style="font-size:11px;color:#e5e7eb;margin-top:5px;line-height:1.4">${escapeHtml(poi.description)}</div>` : ""}
      ${poi.media_url ? `<a href="${escapeHtml(poi.media_url)}" target="_blank" rel="noopener noreferrer" style="display:block;font-size:11px;color:#60a5fa;margin-top:6px">↗ פתח קישור</a>` : ""}
      <button data-poi-delete style="margin-top:8px;padding:2px 8px;border:1px solid #ef4444;border-radius:4px;background:transparent;color:#ef4444;font-family:inherit;font-size:10px;cursor:pointer">מחק נקודה</button>
    </div>`;
}

function CenterTracker({ onCenterChange }) {
  const map = useMap();
  useEffect(() => {
    if (!onCenterChange) return;
    const report = () => {
      const c = map.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    };
    report();
    map.on("moveend", report);
    return () => map.off("moveend", report);
  }, [map, onCenterChange]);
  return null;
}

function MapRecenter({ center, zoom }) {
  const map = useMap();
  const prevCenter = useRef(null);
  useEffect(() => {
    if (!center) return;
    const isSame = prevCenter.current &&
      prevCenter.current[0] === center[0] &&
      prevCenter.current[1] === center[1];
    if (!isSame) {
      map.flyTo(center, zoom || 14, { duration: 1.2 });
      prevCenter.current = center;
    }
  }, [center, zoom, map]);
  return null;
}

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

// Mounts ONCE — only handles the draw toolbar
function MapRefSetter({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

function DrawControl({ onShapeCreated, suppressDrawRef }) {
  const map = useMap();
  const onShapeCreatedRef = useRef(onShapeCreated);
  useEffect(() => { onShapeCreatedRef.current = onShapeCreated; }, [onShapeCreated]);

  useEffect(() => {
    if (!map) return;

    const drawnItems = new L.FeatureGroup().addTo(map);

    const drawControl = new L.Control.Draw({
      edit: { featureGroup: drawnItems },
      draw: {
        polygon: { shapeOptions: { color: "#3b82f6", fillOpacity: 0.3 } },
        rectangle: { showArea: false, shapeOptions: { color: "#f59e0b", fillOpacity: 0.3 } },
        circle: { shapeOptions: { color: "#10b981", fillOpacity: 0.3 } },
        polyline: { shapeOptions: { color: "#8b5cf6", weight: 3 } },
        marker: false,
        circlemarker: false
      }
    });
    map.addControl(drawControl);

    const onCreated = (e) => {
      if (suppressDrawRef && suppressDrawRef.current) return;
      const geojson = e.layer && typeof e.layer.toGeoJSON === "function" ? e.layer.toGeoJSON() : null;
      onShapeCreatedRef.current(geojson, e.layerType, e.layer);
    };
    map.on(L.Draw.Event.CREATED, onCreated);

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map]);

  return null;
}

// Draws shapes imperatively; redraws on ThreatMap notify (bypasses react-leaflet prop staleness inside MapContainer)
function ShapesLayer({ subscribe, getShapes, onShapeClick }) {
  const map = useMap();
  const groupRef = useRef(null);
  const onShapeClickRef = useRef(onShapeClick);
  useEffect(() => { onShapeClickRef.current = onShapeClick; }, [onShapeClick]);

  const draw = () => {
    if (!map) return;
    if (groupRef.current) groupRef.current.clearLayers();
    else groupRef.current = L.featureGroup().addTo(map);

    getShapes().forEach((shape) => {
      try {
        const geo = JSON.parse(shape.geojson);
        const flagFill = shape.fill_type === "flag" && shape.flag && shape.shape_type !== "polyline";
        const lyr = L.geoJSON(geo, {
          style: {
            color: shape.color || "#3b82f6",
            // A flag pattern is applied as the fill paint (falls back to the plain color)
            fillColor: flagFill ? `url(#flagfill-${shape.flag})` : (shape.color || "#3b82f6"),
            fillOpacity: shape.opacity ?? 0.3,
            weight: 2.5
          }
        });
        if (shape.label) {
          lyr.bindTooltip(shape.label, {
            permanent: true,
            direction: "center",
            className: "shape-label-tooltip"
          });
        }
        lyr.on("click", () => onShapeClickRef.current(shape));
        groupRef.current.addLayer(lyr);
      } catch (e) {}
    });

    // After the paths exist (and with them the map's <svg>), register the flag patterns
    ensureFlagPatterns(map, [...new Set(getShapes()
      .filter((s) => s.fill_type === "flag" && s.flag && s.shape_type !== "polyline")
      .map((s) => s.flag))]);
  };

  useEffect(() => {
    if (!map) return;
    draw();
    const unsub = subscribe(draw);
    return () => {
      unsub();
      if (groupRef.current) groupRef.current.clearLayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

// Draws point-of-interest markers imperatively; respects topic visibility
function PointsLayer({ subscribe, getPoints, getTopicColor, onDelete }) {
  const map = useMap();
  const groupRef = useRef(null);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);

  const draw = () => {
    if (!map) return;
    if (groupRef.current) groupRef.current.clearLayers();
    else groupRef.current = L.featureGroup().addTo(map);

    getPoints().forEach((poi) => {
      if (!poi.latitude || !poi.longitude) return;
      const tColor = getTopicColor(poi.topic);
      const color = poi.marker_color || tColor || "#3b82f6";
      const m = L.marker([poi.latitude, poi.longitude], { icon: makeIcon(color) });
      m.bindPopup(poiPopupHTML(poi, tColor));
      m.on("popupopen", () => {
        const el = m.getPopup().getElement();
        const btn = el && el.querySelector("[data-poi-delete]");
        if (btn) btn.addEventListener("click", () => onDeleteRef.current && onDeleteRef.current(poi.id));
      });
      groupRef.current.addLayer(m);
    });
  };

  useEffect(() => {
    if (!map) return;
    draw();
    const unsub = subscribe(draw);
    return () => {
      unsub();
      if (groupRef.current) groupRef.current.clearLayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

function PlaceLabelsLayer({ labels }) {
  const map = useMap();
  const groupRef = useRef(null);

  useEffect(() => {
    if (!map) return;
    if (groupRef.current) groupRef.current.clearLayers();
    else groupRef.current = L.featureGroup().addTo(map);

    const sizeMap = { small: 11, medium: 14, large: 18 };

    labels.forEach((lbl) => {
      if (!lbl.latitude || !lbl.longitude) return;
      const fontSize = sizeMap[lbl.font_size] || 14;
      const icon = new L.DivIcon({
        className: "",
        html: `<div style="
          color: ${lbl.color || "#facc15"};
          font-family: 'JetBrains Mono', monospace;
          font-size: ${fontSize}px;
          font-weight: 700;
          text-shadow: 0 0 6px #000, 0 0 12px #000, 1px 1px 0 #000, -1px -1px 0 #000;
          white-space: nowrap;
          pointer-events: none;
          user-select: none;
        ">${lbl.name}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });
      const marker = L.marker([lbl.latitude, lbl.longitude], { icon, interactive: false });
      groupRef.current.addLayer(marker);
    });

    return () => { if (groupRef.current) groupRef.current.clearLayers(); };
  }, [map, labels]);

  return null;
}

export default function ThreatMap({
  pois = [],
  topics = [],
  visibleTopics = {},
  focusCoords,
  shapes = [],
  placeLabels = [],
  onShapeAdded,
  onShapeDeleted,
  onShapeEdited,
  onRevealLayer,
  visibleLayers = {},
  onToggleLayer,
  onDeleteLayer,
  isFullscreen = false,
  onToggleFullscreen,
  customLayerNames = [],
  onLayerNamesChange,
  liveItems = [],
  savedLiveIds = [],
  onLiveSave,
  onLiveDetails,
  onPoiDelete,
  onCenterChange
}) {
  const [tileMode, setTileMode] = useState("satellite");
  const mapRef = useRef(null);
  const suppressDrawRef = useRef(false);

  // Shapes saved in this session render immediately, even before the server list catches up.
  const [freshShapes, setFreshShapes] = useState([]);
  const mergedShapes = useMemo(() => {
    const ids = new Set(shapes.map(s => s.id));
    const extra = freshShapes.filter(s => !ids.has(s.id));
    return extra.length ? [...extra, ...shapes] : shapes;
  }, [shapes, freshShapes]);

  const filteredShapes = mergedShapes.filter(s => {
    const layer = s.layer_name || "default";
    return visibleLayers[layer] !== false;
  });

  const visiblePoints = pois.filter(p => visibleTopics[p.topic || "כללי"] === true);

  const allLayerNames = [...new Set(["default", ...(customLayerNames || []), ...mergedShapes.map(s => s.layer_name).filter(Boolean)])];
  const { toast } = useToast();
  const [pendingShape, setPendingShape] = useState(null);
  const [editingShape, setEditingShape] = useState(null);
  const [infoLayer, setInfoLayer] = useState(null);
  const [infoShape, setInfoShape] = useState(null);

  // Refs + subscription so map layers (inside MapContainer) redraw on prop changes
  const shapesRef = useRef(filteredShapes);
  shapesRef.current = filteredShapes;
  const pointsRef = useRef(visiblePoints);
  pointsRef.current = visiblePoints;
  const liveItemsRef = useRef(liveItems);
  liveItemsRef.current = liveItems;
  const topicColorRef = useRef({});
  topicColorRef.current = Object.fromEntries((topics || []).map(t => [t.name, t.color]));
  const subscribersRef = useRef(new Set());
  const subscribe = useCallback((fn) => {
    subscribersRef.current.add(fn);
    return () => subscribersRef.current.delete(fn);
  }, []);
  const getShapes = useCallback(() => shapesRef.current, []);
  const getPoints = useCallback(() => pointsRef.current, []);
  const getLiveItems = useCallback(() => liveItemsRef.current, []);
  const getTopicColor = useCallback((name) => topicColorRef.current[name], []);

  useEffect(() => {
    subscribersRef.current.forEach((fn) => fn());
  }, [pois, topics, visibleTopics, mergedShapes, visibleLayers, liveItems]);

  const handleSaveNew = async ({ label, color, layerName, fillType, flag }) => {
    if (!pendingShape || !pendingShape.geojson) { setPendingShape(null); return; }
    const { geojson, shapeType, layer } = pendingShape;
    const created = await base44.entities.map_shapes.create({
      shape_type: shapeType,
      geojson: JSON.stringify(geojson),
      label,
      color,
      fill_type: fillType || "color",
      flag: fillType === "flag" ? flag : null,
      opacity: 0.3,
      layer_name: layerName || "default"
    });
    if (layer && layer.remove) layer.remove();
    toast({ title: "Shape saved", description: `${shapeType}${label ? ` — "${label}"` : ""} added.` });
    setPendingShape(null);
    setFreshShapes((prev) => [created, ...prev]);
    onRevealLayer?.(layerName || "default");
    onShapeAdded(created);
  };

  const handleSaveEdit = async ({ label, color, layerName, fillType, flag }) => {
    if (!editingShape) return;
    const patch = {
      label,
      color,
      fill_type: fillType || "color",
      flag: fillType === "flag" ? flag : null,
      layer_name: layerName || "default"
    };
    await onShapeEdited(editingShape.id, patch);
    setFreshShapes((prev) => prev.map((s) => (s.id === editingShape.id ? { ...s, ...patch } : s)));
    setEditingShape(null);
  };

  const handleDeleteLayerLocal = async (name) => {
    setFreshShapes((prev) => prev.filter((s) => (s.layer_name || "default") !== name));
    await onDeleteLayer?.(name);
  };

  const handleDeleteShape = async (id) => {
    await onShapeDeleted(id);
    setFreshShapes((prev) => prev.filter((s) => s.id !== id));
    setEditingShape(null);
  };

  const handleShapeClick = (shape) => {
    setInfoShape(shape);
    setInfoLayer(shape.layer_name || "default");
  };

  const closeInfoPanel = () => {
    setInfoLayer(null);
    setInfoShape(null);
  };

  const editShapeFromInfo = () => {
    setEditingShape(infoShape);
    closeInfoPanel();
  };

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden border border-border">
      {/* Top controls */}
      <div className="absolute top-2 left-2 right-2 z-[1000] flex flex-col gap-2 pointer-events-none">
      <div className="flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
        <div className="bg-black/70 backdrop-blur-sm border border-white/10 rounded-md px-3 py-1.5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-chart-3 animate-pulse" />
          <span className="text-xs font-mono text-white/60 uppercase tracking-wider">מפת מחקר</span>
          <span className="text-xs font-mono text-primary font-semibold">{visiblePoints.filter(p => p.latitude && p.longitude).length}</span>
        </div>
        <div className="flex gap-1 flex-wrap justify-end items-center">
          {[
            { id: "satellite",    label: "SAT",    icon: <Satellite className="w-3 h-3" /> },
            { id: "street",       label: "MAP",    icon: <Map className="w-3 h-3" /> },
            { id: "esri_street",  label: "STREET", icon: <Globe className="w-3 h-3" /> },
            { id: "hybrid",       label: "HYBRID", icon: <Satellite className="w-3 h-3" /> },
          ].map(({ id, label, icon }) => (
            <button key={id}
              onClick={() => setTileMode(id)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-all ${tileMode === id ? "bg-primary text-primary-foreground" : "bg-black/70 text-white/60 hover:text-white border border-white/10"}`}
            >
              {icon} {label}
            </button>
          ))}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              title={isFullscreen ? "צא ממסך מלא" : "מסך מלא"}
              className="p-1.5 rounded text-white/60 hover:text-white bg-black/70 border border-white/10 hover:bg-white/10 transition-all"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      <div className="relative w-fit ml-auto flex items-center gap-1 pointer-events-auto">
        <ResearcherTool mapRef={mapRef} suppressDrawRef={suppressDrawRef} />
        <TranslationTool mapRef={mapRef} suppressDrawRef={suppressDrawRef} />
      </div>
      </div>

      <MapContainer
        center={[33.1, 35.2]}
        zoom={9}
        className="w-full h-full"
        style={{ minHeight: "100%" }}
        zoomControl={true}
      >
        <MapResizer />
        <CenterTracker onCenterChange={onCenterChange} />
        <MapRefSetter mapRef={mapRef} />
        {tileMode === "satellite" && (
          <TileLayer key="sat"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri" />
        )}
        {tileMode === "street" && (
          <TileLayer key="street"
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org">OSM</a>' />
        )}
        {tileMode === "esri_street" && (
          <TileLayer key="esri_street"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri" />
        )}
        {/* Satellite imagery with place names, roads and borders drawn on top */}
        {tileMode === "hybrid" && (
          <TileLayer key="hybrid_base"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri" />
        )}
        {tileMode === "hybrid" && (
          <TileLayer key="hybrid_labels"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
        )}

        {focusCoords && <MapRecenter center={[focusCoords.lat, focusCoords.lng]} zoom={14} />}
        <DrawControl suppressDrawRef={suppressDrawRef} onShapeCreated={(a, b, c) => {
          // Normalize both signatures: (geojson, shapeType, layer) or legacy (layer, shapeType)
          if (a && typeof a.toGeoJSON === "function") {
            setPendingShape({ geojson: a.toGeoJSON(), shapeType: b, layer: a });
          } else {
            setPendingShape({ geojson: a, shapeType: b, layer: c });
          }
        }} />
        <ShapesLayer subscribe={subscribe} getShapes={getShapes} onShapeClick={handleShapeClick} />
        <PlaceLabelsLayer labels={placeLabels} />
        <PointsLayer subscribe={subscribe} getPoints={getPoints} getTopicColor={getTopicColor} onDelete={onPoiDelete} />
        <LiveLayer
          subscribe={subscribe}
          getItems={getLiveItems}
          onSave={onLiveSave}
          savedIds={savedLiveIds}
          onDetails={onLiveDetails} />
      </MapContainer>

      <LayersPanel
        className="hidden lg:block lg:w-auto lg:absolute lg:bottom-10 lg:left-3 lg:z-[1000]"
        shapes={mergedShapes}
        visibleLayers={visibleLayers}
        onToggleLayer={onToggleLayer}
        onDeleteLayer={handleDeleteLayerLocal}
        onLayerNamesChange={onLayerNamesChange}
      />

      {infoShape && (
        <LayerInfoPanel
          shape={infoShape}
          onClose={closeInfoPanel}
          onEditShape={editShapeFromInfo}
        />
      )}

      <ShapeSaveDialog
        open={!!pendingShape}
        shapeType={pendingShape?.shapeType}
        onSave={handleSaveNew}
        onCancel={() => setPendingShape(null)}
        availableLayers={allLayerNames}
      />
      <ShapeEditDialog
        open={!!editingShape}
        shape={editingShape}
        onSave={handleSaveEdit}
        onDelete={handleDeleteShape}
        onCancel={() => setEditingShape(null)}
        availableLayers={allLayerNames}
      />
    </div>
  );
}
