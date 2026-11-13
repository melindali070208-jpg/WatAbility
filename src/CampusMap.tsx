import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Feature } from "geojson";

import workerUrl from
  "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import { buildings } from "./buildings";
import type { RouteResult } from "./routes";
import { calculateRouteStats } from "./routeStats";
import { hazardLabel, type Hazard } from "./hazards";

import "maplibre-gl/dist/maplibre-gl.css";
import "./CampusMap.css";

maplibregl.setWorkerUrl(workerUrl);

type Coordinates = [number, number];

const round = (n: number) => Number(n.toFixed(6));

// True briefly after a line-drag so the mouseup does not also count as a click
let justDragged = false;

type CampusMapProps = {
  selectedBuilding: string;
  route: RouteResult | null;
  routeOptions: RouteResult[];
  selectedRouteIndex: number;
  onSelectRoute: (index: number) => void;
  editingRoute: boolean;
  waypoints: Coordinates[];
  onAddStop: (point: Coordinates) => void;
  onInsertStop: (grabbedAt: Coordinates, dropped: Coordinates) => void;
  onMoveStop: (index: number, point: Coordinates) => void;
  reporting?: boolean;
  hazards?: Hazard[];
  pendingReport?: Coordinates | null;
  onPlaceReport?: (point: Coordinates) => void;
  onHazardFeedback?: (
    hazardId: string,
    feedback: "still_there" | "looks_fixed"
  ) => Promise<void>;

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
  route: RouteResult | null,
  fit = true
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
    fit &&
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

function CampusMap({
  selectedBuilding,
  route,
  routeOptions,
  selectedRouteIndex,
  onSelectRoute,
  editingRoute,
  waypoints,
  onAddStop,
  onInsertStop,
  onMoveStop,
  reporting = false,
  hazards = [],
  pendingReport = null,
  onPlaceReport = () => {},
  onHazardFeedback = async () => {}
  }: CampusMapProps) {



  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Keep updated values available to map events
  const routeRef = useRef(route);
  const routeOptionsRef = useRef(routeOptions);
  const selectedIndexRef = useRef(selectedRouteIndex);
  const editingRef = useRef(editingRoute);
  const addStopRef = useRef(onAddStop);
  const insertStopRef = useRef(onInsertStop);
  const moveStopRef = useRef(onMoveStop);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const hazardMarkersRef = useRef<maplibregl.Marker[]>([]);
  const pendingMarkerRef = useRef<maplibregl.Marker | null>(null);
  const reportingRef = useRef(reporting);
  const placeReportRef = useRef(onPlaceReport);
  const hazardFeedbackRef = useRef(onHazardFeedback);
  const selectRouteRef = useRef(onSelectRoute);

  routeRef.current = route;
  routeOptionsRef.current = routeOptions;
  selectedIndexRef.current = selectedRouteIndex;
  editingRef.current = editingRoute;
  addStopRef.current = onAddStop;
  insertStopRef.current = onInsertStop;
  moveStopRef.current = onMoveStop;
  reportingRef.current = reporting;
  placeReportRef.current = onPlaceReport;
  hazardFeedbackRef.current = onHazardFeedback;
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
        color: "#d06fc2"
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
      drawAlternativeRoutes(
        map,
        routeOptionsRef.current,
        selectedIndexRef.current
      );

      drawRoute(map, routeRef.current, !editingRef.current);

      // ========================================
      // DRAG THE ROUTE LINE TO ADD / BEND A STOP
      // ========================================

      let grabbedAt: Coordinates | null = null;

      const ghostElement = document.createElement("div");
      ghostElement.className = "drag-ghost";
      const ghost = new maplibregl.Marker({ element: ghostElement });

      map.on("mouseenter", "route-line", () => {
        if (editingRef.current) {
          map.getCanvas().style.cursor = "grab";
        }
      });

      map.on("mouseleave", "route-line", () => {
        if (!grabbedAt) map.getCanvas().style.cursor = "";
      });

      map.on("mousedown", "route-line", (event) => {
        if (!editingRef.current) return;

        event.preventDefault();
        grabbedAt = [event.lngLat.lng, event.lngLat.lat];
        map.dragPan.disable();
      });

      map.on("mousemove", (event) => {
        if (!grabbedAt) return;
        ghost.setLngLat(event.lngLat).addTo(map);
      });

      map.on("mouseup", (event) => {
        if (!grabbedAt) return;

        const from = grabbedAt;
        grabbedAt = null;

        ghost.remove();
        map.dragPan.enable();

        const a = map.project(from);
        const b = map.project(event.lngLat);
        const movedPixels = Math.hypot(a.x - b.x, a.y - b.y);

        // Ignore tiny movements so a plain click still adds a stop
        if (movedPixels < 6) return;

        justDragged = true;
        setTimeout(() => { justDragged = false; }, 50);

        insertStopRef.current(
          [round(from[0]), round(from[1])],
          [round(event.lngLat.lng), round(event.lngLat.lat)]
        );
      });
    });

    // ========================================
    // CLICK MAP TO ADD A STOP
    // ========================================

    map.on("click", (event) => {
      // Clicking an existing issue marker should only open its popup
      const target = event.originalEvent.target as HTMLElement;
      if (target.closest(".hazard-marker")) return;

      const point: Coordinates = [
        round(event.lngLat.lng),
        round(event.lngLat.lat)
      ];

      if (reportingRef.current) {
        placeReportRef.current(point);
        return;
      }

      if (!editingRef.current) return;
      if (justDragged) return;

      addStopRef.current(point);
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

    // Do not re-zoom the map while the person is editing stops
    drawRoute(map, route, !editingRef.current);
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
  // STOP MARKERS (numbered, draggable while editing)
  // ========================================

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());

    markersRef.current = waypoints.map((point, index) => {
      const element = document.createElement("div");
      element.className = "stop-marker";
      element.textContent = String(index + 1);
      element.addEventListener("click", (e) => e.stopPropagation());

      const marker = new maplibregl.Marker({
        element,
        draggable: editingRoute
      })
        .setLngLat(point)
        .addTo(map);

      marker.on("dragend", () => {
        const p = marker.getLngLat();
        moveStopRef.current(index, [round(p.lng), round(p.lat)]);
      });

      return marker;
    });
  }, [waypoints, editingRoute]);

  // ========================================
  // REPORTED ISSUE MARKERS
  // ========================================

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    hazardMarkersRef.current.forEach((marker) => marker.remove());

    hazardMarkersRef.current = hazards.map((hazard) => {
      const element = document.createElement("div");
      element.className = "hazard-marker";
      element.textContent = "⚠";

      // Built with textContent because notes are typed by people
      const box = document.createElement("div");

      const title = document.createElement("strong");
      title.textContent = hazardLabel(hazard.type);
      box.appendChild(title);

      if (hazard.note) {
        const note = document.createElement("div");
        note.textContent = hazard.note;
        box.appendChild(note);
      }

      const date = document.createElement("div");
      date.textContent =
        "Reported " +
        new Date(hazard.reportedAt).toLocaleDateString();
      date.style.color = "#64748b";
      date.style.fontSize = "11px";
      box.appendChild(date);

      // ========================================
      // COMMUNITY HAZARD FEEDBACK
      // ========================================

      const feedbackSection = document.createElement("div");
      feedbackSection.className = "hazard-feedback";

      const question = document.createElement("p");
      question.textContent = "Is this issue still present?";

      const buttonRow = document.createElement("div");
      buttonRow.className = "hazard-feedback-buttons";

      const stillThereButton = document.createElement("button");
      stillThereButton.type = "button";
      stillThereButton.textContent = "Still there";
      stillThereButton.className = "hazard-still-button";

      const fixedButton = document.createElement("button");
      fixedButton.type = "button";
      fixedButton.textContent = "Looks fixed";
      fixedButton.className = "hazard-fixed-button";

      const status = document.createElement("p");
      status.className = "hazard-feedback-status";
      status.setAttribute("role", "status");

      async function sendFeedback(
        feedback: "still_there" | "looks_fixed"
      ) {
        stillThereButton.disabled = true;
        fixedButton.disabled = true;

        status.textContent = "Submitting feedback...";

        try {
          await hazardFeedbackRef.current(
            hazard.id,
            feedback
          );

          status.textContent =
            feedback === "looks_fixed"
              ? "Thanks! A possible fix has been reported for review."
              : "Thanks! Your confirmation was recorded.";

        } catch (error) {
          console.error("Hazard feedback failed:", error);

          status.textContent =
            "Could not submit feedback. Please try again.";

          stillThereButton.disabled = false;
          fixedButton.disabled = false;
        }
      }

      stillThereButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void sendFeedback("still_there");
      });

      fixedButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void sendFeedback("looks_fixed");
      });

      buttonRow.appendChild(stillThereButton);
      buttonRow.appendChild(fixedButton);

      feedbackSection.appendChild(question);
      feedbackSection.appendChild(buttonRow);
      feedbackSection.appendChild(status);

      box.appendChild(feedbackSection);

      return new maplibregl.Marker({ element })
        .setLngLat(hazard.coordinates)
        .setPopup(
          new maplibregl.Popup({ offset: 18 }).setDOMContent(box)
        )
        .addTo(map);
    });
  }, [hazards]);

  // The spot just clicked, before the report is submitted
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    pendingMarkerRef.current?.remove();
    pendingMarkerRef.current = null;

    if (!pendingReport) return;

    
    const element = document.createElement("div");
    element.className = "hazard-marker pending";
    element.textContent = "⚠";
    element.title = "Selected accessibility issue location";


    pendingMarkerRef.current = new maplibregl.Marker({ element })
      .setLngLat(pendingReport)
      .addTo(map);
  }, [pendingReport]);

  return (
    <div
      ref={mapContainer}
      className="campus-map"
      style={{
        cursor: editingRoute || reporting ? "crosshair" : "grab"
      }}
    />
  );
}

export default CampusMap;