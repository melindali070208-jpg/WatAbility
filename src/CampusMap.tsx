
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Feature } from "geojson";

import workerUrl from
  "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import { buildings } from "./buildings";
import type { RouteResult } from "./routes";
import type { SavedPath } from "./savedPaths";
import { calculateRouteStats } from "./routeStats";

import "maplibre-gl/dist/maplibre-gl.css";
import "./CampusMap.css";

maplibregl.setWorkerUrl(workerUrl);

type Coordinates = [number, number];

type CampusMapProps = {
  selectedBuilding: string;
  route: RouteResult | null;
  routeOptions: RouteResult[];
  selectedRouteIndex: number;
  onSelectRoute: (index: number) => void;
  editingPaths: boolean;
  pathPoints: Coordinates[];
  savedPaths: SavedPath[];
  onAddPoint: (point: Coordinates) => void;
};

// Colours for alternative routes
const ALTERNATIVE_COLORS = [
  "#e87924",
  "#9333ea",
  "#db2777",
  "#0891b2"
];

// Update an existing map data source
function updateSource(
  map: maplibregl.Map,
  sourceId: string,
  features: Feature[]
) {
  const source = map.getSource(sourceId);

  if (source instanceof maplibregl.GeoJSONSource) {
    source.setData({
      type: "FeatureCollection",
      features
    });
  }
}

// Draw the selected route as a solid blue line
function drawRoute(
  map: maplibregl.Map,
  route: RouteResult | null
) {
  const coordinates = route?.coordinates ?? [];

  const features: Feature[] =
    coordinates.length >= 2
      ? [{
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates
          }
        }]
      : [];

  updateSource(map, "route", features);

  if (
    coordinates.length >= 2 &&
    map.getSource("route")
  ) {
    const bounds = new maplibregl.LngLatBounds();

    coordinates.forEach((point) => {
      bounds.extend(point);
    });

    map.fitBounds(bounds, {
      padding: 80,
      maxZoom: 16.5,
      duration: 700
    });
  }
}

// Draw unselected routes as coloured dotted lines
function drawAlternativeRoutes(
  map: maplibregl.Map,
  routeOptions: RouteResult[],
  selectedIndex: number
) {
  const features: Feature[] = [];

  routeOptions.forEach((option, index) => {
    // The selected route is drawn separately in blue
    if (index === selectedIndex) return;
    if (option.coordinates.length < 2) return;

    const stats = calculateRouteStats(option);

    const colour =
      ALTERNATIVE_COLORS[
        index % ALTERNATIVE_COLORS.length
      ];

    features.push({
      type: "Feature",
      properties: {
        routeIndex: index,
        routeNumber: index + 1,
        distanceMetres: stats.distanceMetres,
        walkingMinutes: stats.walkingMinutes,
        color: colour
      },
      geometry: {
        type: "LineString",
        coordinates: option.coordinates
      }
    });
  });

  updateSource(map, "alternative-routes", features);
}

// Draw unsaved orange pathway
function drawDraftPath(
  map: maplibregl.Map,
  points: Coordinates[]
) {
  const features: Feature[] =
    points.map((point) => ({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Point",
        coordinates: point
      }
    }));

  if (points.length >= 2) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: points
      }
    });
  }

  updateSource(map, "draft-path", features);
}

// Draw saved green pathways
function drawSavedPaths(
  map: maplibregl.Map,
  savedPaths: SavedPath[]
) {
  const features: Feature[] =
    savedPaths.map((path) => ({
      type: "Feature",
      properties: {
        name: path.name,
        accessibility: path.accessibility
      },
      geometry: {
        type: "LineString",
        coordinates: path.coordinates
      }
    }));

  updateSource(map, "saved-paths", features);
}

function CampusMap({
  selectedBuilding,
  route,
  routeOptions,
  selectedRouteIndex,
  onSelectRoute,
  editingPaths,
  pathPoints,
  savedPaths,
  onAddPoint
}: CampusMapProps) {

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Keep updated values available to map events
  const routeRef = useRef(route);
  const routeOptionsRef = useRef(routeOptions);
  const selectedIndexRef = useRef(selectedRouteIndex);
  const editingRef = useRef(editingPaths);
  const pointsRef = useRef(pathPoints);
  const savedRef = useRef(savedPaths);
  const addPointRef = useRef(onAddPoint);
  const selectRouteRef = useRef(onSelectRoute);

  routeRef.current = route;
  routeOptionsRef.current = routeOptions;
  selectedIndexRef.current = selectedRouteIndex;
  editingRef.current = editingPaths;
  pointsRef.current = pathPoints;
  savedRef.current = savedPaths;
  addPointRef.current = onAddPoint;
  selectRouteRef.current = onSelectRoute;

  // ========================================
  // CREATE MAP ONCE
  // ========================================

  useEffect(() => {
    const container = mapContainer.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: "https://tiles.openfreemap.org/styles/bright",
      center: [-80.5425, 43.4715],
      zoom: 15
    });

    mapRef.current = map;

    // Standard zoom and compass controls
    map.addControl(
      new maplibregl.NavigationControl(),
      "top-right"
    );

    // Fullscreen control
    map.addControl(
      new maplibregl.FullscreenControl({
        container
      }),
      "top-right"
    );

    // Recenter control
    class RecenterControl implements maplibregl.IControl {
      private container!: HTMLDivElement;
      private map!: maplibregl.Map;

      onAdd(currentMap: maplibregl.Map): HTMLElement {
        this.map = currentMap;

        this.container =
          document.createElement("div");

        this.container.className =
          "maplibregl-ctrl maplibregl-ctrl-group";

        const button = document.createElement("button");

        button.type = "button";
        button.title = "Recenter Map";
        button.setAttribute(
          "aria-label",
          "Recenter Map"
        );

        button.textContent = "⌖";
        button.style.fontSize = "24px";
        button.style.cursor = "pointer";

        button.addEventListener("click", () => {
          this.map.flyTo({
            center: [-80.5425, 43.4715],
            zoom: 15,
            bearing: 0,
            pitch: 0,
            essential: true
          });
        });

        this.container.appendChild(button);

        return this.container;
      }

      onRemove(): void {
        this.container.remove();
      }
    }

    map.addControl(
      new RecenterControl(),
      "top-right"
    );

    // ========================================
    // BUILDING MARKERS
    // ========================================

    buildings.forEach((building) => {
      new maplibregl.Marker({
        color: "#0f766e"
      })
        .setLngLat(building.coordinates)
        .setPopup(
          new maplibregl.Popup({
            offset: 25
          }).setText(building.name)
        )
        .addTo(map);
    });

    // Popup for hovering over alternative routes
    const routePopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14
    });

    let hoveredRouteIndex = -1;

    // ========================================
    // INITIALIZE MAP LAYERS
    // ========================================

    map.on("load", () => {

      // GREEN SAVED PATHWAYS

      map.addSource("saved-paths", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: []
        }
      });

      map.addLayer({
        id: "saved-path-lines",
        type: "line",
        source: "saved-paths",
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#0f766e",
          "line-width": 5,
          "line-opacity": 0.85
        }
      });

      // ALTERNATIVE ROUTE SOURCE

      map.addSource("alternative-routes", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: []
        }
      });

      // COLOURED DOTTED ALTERNATIVE LINES

      map.addLayer({
        id: "alternative-lines",
        type: "line",
        source: "alternative-routes",
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 5,
          "line-opacity": 0.9,
          "line-dasharray": [0.5, 2]
        }
      });

      // BLUE SELECTED ROUTE

      map.addSource("route", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: []
        }
      });

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#2563eb",
          "line-width": 6
        }
      });

      // ORANGE PATHWAY EDITOR

      map.addSource("draft-path", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: []
        }
      });

      map.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft-path",
        filter: ["==", "$type", "LineString"],
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#e87924",
          "line-width": 5,
          "line-dasharray": [2, 1]
        }
      });

      map.addLayer({
        id: "draft-points",
        type: "circle",
        source: "draft-path",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#ea580c",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2
        }
      });

      // INVISIBLE WIDE HIT AREA
      // Makes dotted lines easier to click

      map.addLayer({
        id: "alternative-hit",
        type: "line",
        source: "alternative-routes",
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#ffffff",
          "line-width": 16,
          "line-opacity": 0.01
        }
      });

      // ========================================
      // INTERACTIVE ALTERNATIVE ROUTES
      // ========================================

      map.on(
        "mousemove",
        "alternative-hit",
        (event) => {
          if (editingRef.current) return;

          const feature = event.features?.[0];

          if (!feature) return;

          const index = Number(
            feature.properties?.routeIndex
          );

          if (!Number.isInteger(index)) return;

          map.getCanvas().style.cursor = "pointer";

          if (hoveredRouteIndex !== index) {
            hoveredRouteIndex = index;

            const option =
              routeOptionsRef.current[index];

            if (!option) return;

            const stats = calculateRouteStats(option);

            const distance =
              stats.distanceMetres >= 1000
                ? `${(
                    stats.distanceMetres / 1000
                  ).toFixed(2)} km`
                : `${stats.distanceMetres} m`;

            // Build safe popup content
            const popupContent =
              document.createElement("div");

            popupContent.style.fontFamily =
              "Arial, sans-serif";

            popupContent.style.fontSize = "12px";
            popupContent.style.lineHeight = "1.6";
            popupContent.style.color = "#1e293b";

            const title = document.createElement("strong");
            title.textContent = `Route ${index + 1}`;

            const info = document.createElement("div");
            info.textContent =
              `${distance} · ${stats.walkingMinutes} min`;

            const hint = document.createElement("div");
            hint.textContent = "Click to select this route";
            hint.style.color = "#64748b";
            hint.style.fontSize = "10px";

            popupContent.appendChild(title);
            popupContent.appendChild(info);
            popupContent.appendChild(hint);

            routePopup.setDOMContent(popupContent);
          }

          routePopup
            .setLngLat(event.lngLat)
            .addTo(map);
        }
      );

      map.on(
        "mouseleave",
        "alternative-hit",
        () => {
          hoveredRouteIndex = -1;
          routePopup.remove();
          map.getCanvas().style.cursor = "";
        }
      );

      // Select a route by clicking its dotted line
      map.on(
        "click",
        "alternative-hit",
        (event) => {
          if (editingRef.current) return;

          const feature = event.features?.[0];

          if (!feature) return;

          const index = Number(
            feature.properties?.routeIndex
          );

          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= routeOptionsRef.current.length
          ) {
            return;
          }

          routePopup.remove();
          hoveredRouteIndex = -1;

          selectRouteRef.current(index);
        }
      );

      // Load current data after sources exist
      drawSavedPaths(map, savedRef.current);

      drawAlternativeRoutes(
        map,
        routeOptionsRef.current,
        selectedIndexRef.current
      );

      drawRoute(map, routeRef.current);
      drawDraftPath(map, pointsRef.current);
    });

    // ========================================
    // PATHWAY EDITOR CLICKING
    // ========================================

    map.on("click", (event) => {
      if (!editingRef.current) return;

      const point: Coordinates = [
        Number(event.lngLat.lng.toFixed(6)),
        Number(event.lngLat.lat.toFixed(6))
      ];

      addPointRef.current(point);
    });

    map.on("error", (event) => {
      console.error("MapLibre error:", event.error);
    });

    // Cleanup when component unmounts
    return () => {
      routePopup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ========================================
  // SELECTED BUILDING
  // ========================================

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedBuilding) return;

    const building = buildings.find(
      (item) => item.id === selectedBuilding
    );

    if (!building) return;

    map.flyTo({
      center: building.coordinates,
      zoom: 17,
      essential: true
    });
  }, [selectedBuilding]);

  // ========================================
  // UPDATE SELECTED BLUE ROUTE
  // ========================================

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("route")) return;

    drawRoute(map, route);
  }, [route]);

  // ========================================
  // UPDATE ALTERNATIVE DOTTED ROUTES
  // ========================================

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !map.getSource("alternative-routes")) {
      return;
    }

    drawAlternativeRoutes(
      map,
      routeOptions,
      selectedRouteIndex
    );
  }, [routeOptions, selectedRouteIndex]);

  // ========================================
  // UPDATE ORANGE PATHWAY EDITOR
  // ========================================

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("draft-path")) return;

    drawDraftPath(map, pathPoints);
  }, [pathPoints]);

  // ========================================
  // UPDATE GREEN SAVED PATHWAYS
  // ========================================

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("saved-paths")) return;

    drawSavedPaths(map, savedPaths);
  }, [savedPaths]);

  return (
    <div
      ref={mapContainer}
      className="campus-map"
      style={{
        cursor: editingPaths ? "crosshair" : "grab"
      }}
    />
  );
}

export default CampusMap;
