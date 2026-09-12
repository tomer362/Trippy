"use client";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { AdvancedMarker, APIProvider, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import { Crosshair, Layers, MapPinOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Pin } from "./pin";
import type { MapMarker, MapRoute, MapView } from "./types";

const CLUSTER_THRESHOLD = 45;

export function MapUnavailable({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 bg-muted p-6 text-center",
        className,
      )}
    >
      <MapPinOff className="size-7 text-muted-foreground" />
      <p className="font-semibold">Map not configured</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Add a Google Maps browser key to see your places on a map. See <code>docs/SETUP.md</code>.
      </p>
    </div>
  );
}

export type TripMapProps = {
  apiKey: string | null;
  mapId?: string | null;
  markers: MapMarker[];
  routes?: MapRoute[];
  view?: MapView;
  /** Changing this string refits the viewport (e.g. when the day or list filter changes). */
  fitKey?: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onMapClick?: (position: { lat: number; lng: number }) => void;
  className?: string;
  children?: React.ReactNode;
};

export function TripMap({ apiKey, mapId, className, ...rest }: TripMapProps) {
  if (!apiKey) return <MapUnavailable className={className} />;
  return (
    <APIProvider apiKey={apiKey} libraries={["marker", "geometry"]}>
      <div className={cn("relative", className)}>
        <MapCanvas mapId={mapId ?? "DEMO_MAP_ID"} {...rest} />
      </div>
    </APIProvider>
  );
}

function MapCanvas({
  mapId,
  markers,
  routes = [],
  view,
  fitKey,
  selectedId,
  onSelect,
  onMapClick,
  children,
}: Omit<TripMapProps, "apiKey" | "className"> & { mapId: string }) {
  const center =
    view?.center ??
    (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : { lat: 20, lng: 0 });
  return (
    <GoogleMap
      mapId={mapId}
      defaultCenter={center}
      defaultZoom={view?.zoom ?? (markers.length ? 12 : 2)}
      gestureHandling="greedy"
      disableDefaultUI
      zoomControl
      clickableIcons={false}
      reuseMaps
      className="size-full"
      onClick={(e) => {
        const pos = e.detail.latLng;
        if (pos && onMapClick) onMapClick({ lat: pos.lat, lng: pos.lng });
        else onSelect?.(null);
      }}
    >
      <Viewport markers={markers} view={view} fitKey={fitKey} />
      <Routes routes={routes} />
      <Markers markers={markers} selectedId={selectedId ?? null} onSelect={onSelect} />
      {children}
    </GoogleMap>
  );
}

/** Fits the map to the current markers (or the trip's destination box) when the filter changes. */
function Viewport({
  markers,
  view,
  fitKey,
}: {
  markers: MapMarker[];
  view?: MapView;
  fitKey?: string;
}) {
  const map = useMap();
  const lastFit = useRef<string | null>(null);
  useEffect(() => {
    if (!map) return;
    const key = fitKey ?? `${markers.length}:${markers[0]?.id ?? ""}`;
    if (lastFit.current === key) return;
    lastFit.current = key;
    if (markers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      for (const m of markers) bounds.extend({ lat: m.lat, lng: m.lng });
      map.fitBounds(bounds, { top: 60, bottom: 60, left: 40, right: 40 });
      if (markers.length === 1) map.setZoom(Math.min(15, map.getZoom() ?? 14));
      return;
    }
    if (view?.bbox) {
      const [minLng, minLat, maxLng, maxLat] = view.bbox;
      map.fitBounds(
        new google.maps.LatLngBounds({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng }),
        40,
      );
    } else if (view?.center) {
      map.setCenter(view.center);
      map.setZoom(view.zoom ?? 11);
    }
  }, [map, markers, view, fitKey]);
  return null;
}

function Markers({
  markers,
  selectedId,
  onSelect,
}: {
  markers: MapMarker[];
  selectedId: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const map = useMap();
  const [elements, setElements] = useState<
    Record<string, google.maps.marker.AdvancedMarkerElement | null>
  >({});
  const shouldCluster = markers.length > CLUSTER_THRESHOLD;

  const clusterer = useMemo(
    () => (map && shouldCluster ? new MarkerClusterer({ map }) : null),
    [map, shouldCluster],
  );
  useEffect(() => () => clusterer?.setMap(null), [clusterer]);
  useEffect(() => {
    if (!clusterer) return;
    clusterer.clearMarkers();
    clusterer.addMarkers(
      Object.values(elements).filter((m): m is google.maps.marker.AdvancedMarkerElement =>
        Boolean(m),
      ),
    );
  }, [clusterer, elements]);

  const setRef = useCallback(
    (id: string) => (el: google.maps.marker.AdvancedMarkerElement | null) => {
      setElements((prev) => {
        if ((prev[id] ?? null) === el) return prev;
        const next = { ...prev };
        if (el) next[id] = el;
        else delete next[id];
        return next;
      });
    },
    [],
  );

  return (
    <>
      {markers.map((m) => (
        <AdvancedMarker
          key={m.id}
          ref={shouldCluster ? setRef(m.id) : undefined}
          position={{ lat: m.lat, lng: m.lng }}
          title={m.title}
          zIndex={selectedId === m.id ? 1000 : m.variant === "suggestion" ? 1 : 10}
          onClick={() => onSelect?.(m.id)}
        >
          <Pin marker={m} selected={selectedId === m.id} />
        </AdvancedMarker>
      ))}
    </>
  );
}

/** Draws day routes; decodes Routes API polylines when present, else joins the stops. */
function Routes({ routes }: { routes: MapRoute[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || routes.length === 0) return;
    const lines = routes.map((r) => {
      const path =
        r.encoded && google.maps.geometry?.encoding
          ? google.maps.geometry.encoding
              .decodePath(r.encoded)
              .map((p) => ({ lat: p.lat(), lng: p.lng() }))
          : (r.points ?? []);
      return new google.maps.Polyline({
        map,
        path,
        strokeColor: r.colorHex,
        strokeOpacity: r.dashed ? 0 : 0.85,
        strokeWeight: 4,
        icons: r.dashed
          ? [
              {
                icon: { path: "M 0,-1 0,1", strokeOpacity: 0.8, scale: 3 },
                offset: "0",
                repeat: "12px",
              },
            ]
          : undefined,
      });
    });
    return () => {
      for (const l of lines) l.setMap(null);
    };
  }, [map, routes]);
  return null;
}

/** Floating control cluster rendered over the map (layers, recenter). */
export function MapOverlayControls({
  onRecenter,
  onToggleLayers,
  layersOpen,
  className,
}: {
  onRecenter?: () => void;
  onToggleLayers?: () => void;
  layersOpen?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("absolute right-3 top-3 z-10 flex flex-col gap-2", className)}>
      {onToggleLayers && (
        <button
          type="button"
          onClick={onToggleLayers}
          aria-pressed={layersOpen}
          aria-label="Map layers"
          className="rounded-full bg-background/95 p-2.5 shadow-md ring-1 ring-border hover:bg-muted"
        >
          <Layers className="size-5" />
        </button>
      )}
      {onRecenter && (
        <button
          type="button"
          onClick={onRecenter}
          aria-label="Recenter map"
          className="rounded-full bg-background/95 p-2.5 shadow-md ring-1 ring-border hover:bg-muted"
        >
          <Crosshair className="size-5" />
        </button>
      )}
    </div>
  );
}
