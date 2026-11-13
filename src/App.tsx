
import { useState, useRef, useEffect } from "react";
import CampusMap from "./CampusMap";
import { buildings } from "./buildings";
import type { RouteResult } from "./routes";
import { findWalkingRoutes } from "./pedestrianRouting";
import { calculateRouteStats } from "./routeStats";

import { getInsertIndex } from "./routeStops";


import {
  avoidAreasFor,
  HAZARD_OPTIONS,
  hazardLabel,
  type Hazard,
  type HazardType
} from "./hazards";

import {
  loadSavedRoutes,
  storeSavedRoutes,
  type SavedRoute,
  type Coordinates
} from "./savedRoutes";

import "./App.css";

import {
  fetchSharedHazards,
  submitSharedHazard,
  submitHazardFeedback,
  type HazardFeedback
} from "./hazardDatabase";


function App() {
  // ========================================
  // ROUTE SELECTION
  // ========================================

  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [avoidStairs, setAvoidStairs] = useState(true);

  const [message, setMessage] = useState("");
  const [showReportSuccess, setShowReportSuccess] =
    useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedBuilding, setSelectedBuilding] =
    useState("");

  // ========================================
  // CURRENT ROUTE
  // ========================================

  const [route, setRoute] =
    useState<RouteResult | null>(null);
    
  const [routeOptions, setRouteOptions] =
    useState<RouteResult[]>([]);

  const [selectedRouteIndex, setSelectedRouteIndex] =
    useState(0);

  const routeStats = route
    ? calculateRouteStats(route)
    : null;

  // ========================================
  // ROUTE EDITOR
  // ========================================

  const [editingRoute, setEditingRoute] = useState(false);

  const [waypoints, setWaypoints] =
    useState<Coordinates[]>([]);

  const [routeName, setRouteName] = useState("");

  const [activeRouteId, setActiveRouteId] =
    useState<string | null>(null);

    // Earlier stop lists, so Undo can step back through edits
  const [history, setHistory] =
    useState<Coordinates[][]>([]);

  const [savedRoutes, setSavedRoutes] =
    useState<SavedRoute[]>(loadSavedRoutes);

  // ========================================
  // REPORTED ISSUES
  // ========================================

  const [hazards, setHazards] =
  useState<Hazard[]>([]);
  const [reporting, setReporting] = useState(false);

  const [pendingReport, setPendingReport] =
    useState<Coordinates | null>(null);

  const [reportType, setReportType] =
    useState<HazardType>("elevator");

  const reportOptions = (
    HAZARD_OPTIONS as readonly unknown[]
  ).flatMap((item) => {
    if (typeof item === "string") {
      const value = item as HazardType;
      return [{ value, label: hazardLabel(value) }];
    }

    if (!item || typeof item !== "object") {
      return [];
    }

    const option = item as {
      value?: HazardType;
      type?: HazardType;
      id?: HazardType;
      label?: string;
    };

    const value = option.value ?? option.type ?? option.id;

    return value
      ? [{ value, label: option.label ?? hazardLabel(value) }]
      : [];
  });

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        const reports = await fetchSharedHazards();

        if (!cancelled) {
          setHazards(reports);
        }
      } catch (error) {
        console.error("Could not load reports:", error);
        if (!cancelled) {
          setMessage(
            "Could not load shared accessibility reports."
          );
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, []);

  
  async function submitHazard() {
    if (!pendingReport) {
      setMessage("Please select an issue location.");
      return;
    }

    setIsLoading(true);

    try {
      await submitSharedHazard(
        reportType,
        pendingReport
      );

      const updatedReports = await fetchSharedHazards();

      setHazards(updatedReports);

      setPendingReport(null);
      setReportType("elevator");
      setReporting(false);
      setShowReportSuccess(true);

      
    } catch (error) {
      console.error("Report submission failed:", error);
      setMessage("Unable to submit the report.");
    } finally {
      setIsLoading(false);
    }
  }



  // ========================================
  // FIND AUTOMATIC WALKING ROUTE
  // ========================================

  // Latest request wins, so fast edits never show stale routes
  const requestId = useRef(0);

  async function findRoute(
    stops: Coordinates[] = waypoints,
    quiet = false,
    from = start,
    to = destination,
    avoid = avoidStairs,
    activeHazards = hazards
  ) {
    if (!from || !to) {
      setMessage(
        "Please select a starting building and destination."
      );
      setRoute(null);
      setRouteOptions([]);
      return;
    }

    if (from === to) {
      setMessage("Please select two different buildings.");
      setRoute(null);
      setRouteOptions([]);
      return;
    }

    const id = ++requestId.current;

    setMessage(
      quiet ? "Updating route..." : "Finding walking routes..."
    );

    // While editing stops, keep the old line visible until the
    // new one arrives so the map does not flicker
    if (!quiet) {
      setRoute(null);
      setRouteOptions([]);
      setSelectedRouteIndex(0);
    }

    setIsLoading(true);

    try {
      const keepClear = [from, to].flatMap((id) => {
        const building = buildings.find((b) => b.id === id);
        return building ? [building.coordinates] : [];
      });

      const avoidAreas = avoid
        ? avoidAreasFor(activeHazards, keepClear)
        : [];

      const results = await findWalkingRoutes(
        from,
        to,
        avoid,
        stops,
        avoidAreas
      );

      if (id !== requestId.current) return;

      if (results.length === 0) {
        setMessage(
          "No walking routes were found for these stops."
        );
        return;
      }

      setRouteOptions(results);
      setSelectedRouteIndex(0);
      setRoute(results[0]);

      setMessage(
        stops.length > 0
          ? `Route updated with ${stops.length} stop${stops.length === 1 ? "" : "s"}. Accessibility is unverified.`
          : results.length > 1
            ? `${results.length} walking routes found. Select an option to compare. Accessibility is unverified.`
            : "Walking route found. No additional alternatives are available. Accessibility is unverified."
      );

    } catch (error) {
      console.error("Routing error:", error);

      if (id !== requestId.current) return;

      setMessage(
        "Could not load walking routes. Please try again."
      );

    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
      }
    }
  }


  // ========================================
  // CLEAR CURRENT ROUTE
  // ========================================

  function clearPreviousRoute() {
    setWaypoints([]);
    setHistory([]);
    setActiveRouteId(null);
    setEditingRoute(false);
    setRoute(null);
    setRouteOptions([]);
    setSelectedRouteIndex(0);
    setMessage("");
  }

  // ========================================
  // EDIT STOPS ON THE ROUTE
  // ========================================

  function nameOf(id: string) {
    return buildings.find((b) => b.id === id)?.name ?? "";
  }

    function applyStops(next: Coordinates[], record = true) {
    if (record) {
      setHistory((previous) => [...previous, waypoints]);
    }

    setWaypoints(next);
    findRoute(next, true);
  }

  function undoStop() {
    const previous = history[history.length - 1];
    if (!previous) return;

    setHistory((items) => items.slice(0, -1));
    applyStops(previous, false);
  }

  function clearStops() {
    if (waypoints.length === 0) return;
    applyStops([]);
  }

  function addStop(point: Coordinates) {
    if (!start || !destination) {
      setMessage("Choose a start and destination first.");
      return;
    }
    applyStops([...waypoints, point]);
  }

  // Dragging the line: grabbedAt decides the position in the
  // stop list, dropped is the new stop's location
  function insertStop(grabbedAt: Coordinates, dropped: Coordinates) {
    if (!route) return;

    const index = getInsertIndex(route, waypoints, grabbedAt);

    applyStops([
      ...waypoints.slice(0, index),
      dropped,
      ...waypoints.slice(index)
    ]);
  }

  function moveStop(index: number, point: Coordinates) {
    applyStops(waypoints.map((p, i) => (i === index ? point : p)));
  }

  function removeStop(index: number) {
    applyStops(waypoints.filter((_, i) => i !== index));
  }

  // ========================================
  // SAVED ROUTES
  // ========================================

  function saveRoute() {
    if (!start || !destination) {
      setMessage("Choose a start and destination first.");
      return;
    }

    const name =
      routeName.trim() ||
      `${nameOf(start)} → ${nameOf(destination)}`;

    const entry: SavedRoute = {
      id: activeRouteId ?? crypto.randomUUID(),
      name,
      start,
      destination,
      avoidStairs,
      waypoints
    };

    const exists = savedRoutes.some((r) => r.id === entry.id);

    const updated = exists
      ? savedRoutes.map((r) => (r.id === entry.id ? entry : r))
      : [...savedRoutes, entry];

    try {
      storeSavedRoutes(updated);
      setSavedRoutes(updated);
      setActiveRouteId(entry.id);
      setRouteName(name);
      setMessage(exists ? "Route updated." : "Route saved.");
    } catch {
      setMessage("Unable to save. Browser storage may be full.");
    }
  }

  function loadRoute(saved: SavedRoute) {
    setStart(saved.start);
    setDestination(saved.destination);
    setAvoidStairs(saved.avoidStairs);
    setSelectedBuilding(saved.start);
    setWaypoints(saved.waypoints);
    setHistory([]);
    setRouteName(saved.name);
    setActiveRouteId(saved.id);
    setEditingRoute(true);

    findRoute(
      saved.waypoints,
      false,
      saved.start,
      saved.destination,
      saved.avoidStairs
    );
  }

  function deleteRoute(id: string) {
    const updated = savedRoutes.filter((r) => r.id !== id);

    try {
      storeSavedRoutes(updated);
      setSavedRoutes(updated);
      if (activeRouteId === id) setActiveRouteId(null);
      setMessage("Route deleted.");
    } catch {
      setMessage("Unable to delete saved route.");
    }
  }

  // ========================================
  // WEBSITE INTERFACE
  // ========================================

  return (
    <div className="app">

      {/* HEADER */}

      <header className="header">
        <h1>WatAbility</h1>
          <div className="header-center">
          <div className="header-center-title">
            Your campus. Your route.
          </div>
          <div className="header-center-subtitle">
            Exploring accessible navigation at Waterloo.
          </div>
        </div>
        <span>Accessible Campus Navigation</span>
      </header>

      <main className="main">

        {/* =====================================
            SIDEBAR
           ===================================== */}

        <aside className="sidebar">

          <h2>Find your route</h2>
          <p>Navigate campus your way.</p>

          {/* STARTING LOCATION */}

          <label htmlFor="start">
            Starting location
          </label>

          <select
            id="start"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setSelectedBuilding(e.target.value);
              clearPreviousRoute();
            }}
          >
            <option value="">
              Choose a location
            </option>

            {buildings.map((building) => (
              <option
                key={building.id}
                value={building.id}
              >
                {building.name}
              </option>
            ))}
          </select>

          {/* DESTINATION */}

          <label htmlFor="destination">
            Destination
          </label>

          <select
            id="destination"
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              setSelectedBuilding(e.target.value);
              clearPreviousRoute();
            }}
          >
            <option value="">
              Choose a destination
            </option>

            {buildings.map((building) => (
              <option
                key={building.id}
                value={building.id}
              >
                {building.name}
              </option>
            ))}
          </select>

          {/* AVOID STAIRS */}

          <div className="checkbox-row">

            <input
              type="checkbox"
              id="avoidStairs"
              checked={avoidStairs}
              onChange={(e) => {
                setAvoidStairs(e.target.checked);
                clearPreviousRoute();
              }}
            />

            <label htmlFor="avoidStairs">
              Wheelchair Accessibility
            </label>

          </div>

          {/* FIND ROUTE BUTTON */}

          <button
            type="button"
            className="find-route-button"
            onClick={() => findRoute()}
            disabled={isLoading}
          >
            {isLoading
              ? "Finding route..."
              : "Find Accessible Route"}
          </button>
          
          {/* ALTERNATIVE ROUTE OPTIONS */}

          {routeOptions.length > 1 && (
            <div className="route-options">

              <h3>Choose a walking route</h3>

              {routeOptions.map((option, index) => {
                const stats = calculateRouteStats(option);

                return (
                  <button
                    key={index}
                    type="button"
                    className={
                      selectedRouteIndex === index
                        ? "route-option selected"
                        : "route-option"
                    }
                    aria-pressed={selectedRouteIndex === index}
                    onClick={() => {
                      setSelectedRouteIndex(index);
                      setRoute(option);
                    }}
                  >
                    <span className="route-option-name">
                      Route {index + 1}
                    </span>

                    <span className="route-option-stats">
                      {stats.distanceMetres >= 1000
                        ? `${(stats.distanceMetres / 1000).toFixed(2)} km`
                        : `${stats.distanceMetres} m`}
                      {" · "}
                      {stats.walkingMinutes} min
                    </span>
                  </button>
                );
              })}

              <p className="route-options-note">
                Routes are based on available map data.
                Accessibility has not been verified.
              </p>

            </div>
          )}

          {message && (
            <p className="message">
              {message}
            </p>
          )}

          {/* ACCESSIBILITY WARNING */}

          <p className="demo-warning">
            Prototype only. Routes use
            OpenStreetMap-based pedestrian routing.
            Stair avoidance and accessibility are
            not guaranteed. Building entrances
            have not been verified.
          </p>

          {/* =====================================
              CUSTOMIZE YOUR ROUTE
             ===================================== */}

          <div className="path-editor">
          <details className="path-editor-panel route-editor">
            <summary className="path-editor-summary">
              <span>📍 Customize Your Route</span>
              <span className="path-editor-arrow">⌄</span>
            </summary>

            <p>
              Add places you'd like to pass through before
              reaching your destination.
            </p>

            <label className="editor-toggle">
              <input
                type="checkbox"
                checked={editingRoute}
                disabled={!route}
                onChange={(e) => {
                  setEditingRoute(e.target.checked);
                  if (e.target.checked) {
                    setReporting(false);
                    setPendingReport(null);
                  }
                }}              />
              Edit route on map
            </label>

            {!route && (
              <p>
                Find a route first, then turn on map editing.
              </p>
            )}

            {editingRoute && (
              <p>
                Click the map to add a stop, or drag the route
                line to bend it through a new point. Drag a
                numbered stop to move it.
              </p>
            )}

            <span className="stop-label">Starting location</span>
            <div className="stop-field stop-start">
              <span>◎ {nameOf(start) || "Choose a starting location"}</span>
            </div>

            {waypoints.map((_, index) => (
              <div key={index}>
                <span className="stop-label">Waypoint</span>
                <div className="stop-field stop-waypoint">
                  <span>◎ Stop {index + 1} · Selected on map</span>
                  <button
                    type="button"
                    aria-label={`Remove stop ${index + 1}`}
                    onClick={() => removeStop(index)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}

            <span className="stop-label">Destination</span>
            <div className="stop-field stop-end">
              <span>⚑ {nameOf(destination) || "Choose a destination"}</span>
            </div>

                        <div className="editor-buttons">
              <button
                type="button"
                className="path-undo-button"
                disabled={history.length === 0}
                onClick={undoStop}
              >
                Undo
              </button>

              <button
                type="button"
                className="path-clear-button"
                disabled={waypoints.length === 0}
                onClick={clearStops}
              >
                Clear
              </button>
            </div>
            
            <button
              type="button"
              className="route-recalc-button"
              disabled={isLoading || !start || !destination}
              onClick={() => findRoute()}
            >
              Recalculate Route
            </button>

            <input
              type="text"
              className="path-name-input"
              placeholder="Route name (optional)"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
            />

            <button
              type="button"
              className="route-save-button"
              disabled={!route}
              onClick={saveRoute}
            >
              Save Entire Route
            </button>
          </details>
          </div>

          {/* =====================================
                REPORT ACCESSIBILITY ISSUE
              ===================================== */}

            <div className="path-editor">
              <details className="path-editor-panel">
              <summary className="path-editor-summary">
                <span>⚠️ Report an Accessibility Issue</span>
                <span className="path-editor-arrow">⌄</span>
              </summary>

                <p>
                  Help identify accessibility problems that
                  may not appear in existing campus map data.
                </p>

                <label className="editor-toggle">
                  <input
                    type="checkbox"
                    checked={reporting}
                    onChange={(e) => {
                      setReporting(e.target.checked);
                      setEditingRoute(false);
                      setPendingReport(null);
                    }}
                  />
                  Select issue location on map
                </label>

                {reporting && (
                  <p>
                    Click the location of the accessibility
                    issue on the campus map.
                  </p>
                )}

                {pendingReport && (
                  <div className="report-location">
                    <p>Location selected!</p>
                    <p>
                      Longitude: {pendingReport[0].toFixed(5)}
                    </p>
                    <p>
                      Latitude: {pendingReport[1].toFixed(5)}
                    </p>

                    <button
                      type="button"
                      onClick={() => setPendingReport(null)}
                    >
                      Choose a different location
                    </button>
                  </div>
                )}

                {/* ISSUE TYPE DROPDOWN */}

                <label htmlFor="reportType">
                  Type of accessibility issue
                </label>

                <select
                  id="reportType"
                  value={reportType}
                  onChange={(e) =>
                    setReportType(e.target.value as HazardType)
                  }
                >
                  {reportOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>

                {/* SUBMIT REPORT BUTTON */}

                <button
                  type="button"
                  className="report-submit-button"
                  onClick={submitHazard}
                  disabled={!pendingReport}
                >
                  Report
                </button>

              </details>
            </div>

          {/* =====================================
              SAVED ROUTES
             ===================================== */}

          <div className="saved-paths">
            <h3>Saved Routes ({savedRoutes.length})</h3>

            {savedRoutes.length === 0 && (
              <p>No routes saved yet.</p>
            )}

            {savedRoutes.map((saved) => (
              <div className="saved-path" key={saved.id}>
                <div>
                  <strong>{saved.name}</strong>
                  <p>
                    {nameOf(saved.start)} → {nameOf(saved.destination)}
                    {" · "}
                    {saved.waypoints.length} stop
                    {saved.waypoints.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="editor-buttons">
                  <button type="button" onClick={() => loadRoute(saved)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => deleteRoute(saved.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

        </aside>

        {/* =====================================
            MAP AREA
           ===================================== */}

        
        <div className="map-area">

          
        <CampusMap
          selectedBuilding={selectedBuilding}
          route={route}

          routeOptions={routeOptions}
          selectedRouteIndex={selectedRouteIndex}

          onSelectRoute={(index) => {
            const selected = routeOptions[index];

            if (!selected) return;

            setSelectedRouteIndex(index);
            setRoute(selected);
          }}

          editingRoute={editingRoute}
          waypoints={waypoints}
          
          onAddStop={addStop}
          onInsertStop={insertStop}
          onMoveStop={moveStop}

          reporting={reporting}
          hazards={hazards}
          pendingReport={pendingReport}
          onPlaceReport={(point) => {
            setPendingReport(point);
          }}

          onHazardFeedback={async (hazardId, feedback: HazardFeedback) => {
            await submitHazardFeedback(hazardId, feedback);
          }}

          />


          {/* FLOATING REPORT SUCCESS NOTIFICATION */}

          {showReportSuccess && (
            <div
              className="report-success-toast"
              role="status"
            >
              <div className="report-success-icon">
                ✓
              </div>

              <div className="report-success-content">
                <strong>Report submitted!</strong>

                <p>
                  Your accessibility report has been saved.
                  This information has not yet been verified.
                </p>
              </div>

              <button
                type="button"
                className="report-success-close"
                aria-label="Dismiss report notification"
                onClick={() => setShowReportSuccess(false)}
              >
                ×
              </button>
            </div>
          )}


          {/* FLOATING ROUTE CARD */}

          {routeStats && (
            <div className="floating-route-card">

              <div className="floating-route-heading">
                <span>Walking route</span>
                <span>🚶</span>
              </div>

              <div className="floating-route-details">

                <div className="floating-route-stat">
                  <strong>
                    {routeStats.distanceMetres >= 1000
                      ? `${(
                          routeStats.distanceMetres / 1000
                        ).toFixed(2)} km`
                      : `${routeStats.distanceMetres} m`}
                  </strong>
                  <span>Distance</span>
                </div>

                <div className="floating-route-divider" />

                <div className="floating-route-stat">
                  <strong>
                    {routeStats.walkingMinutes} min
                  </strong>
                  <span>Est. time</span>
                </div>

              </div>

              {/* EXPANDABLE ACCESSIBILITY SECTION */}

              <details className="route-accessibility">

                <summary>
                  <span className="accessibility-summary-label">
                    ♿ Accessibility details
                  </span>

                  <span className="accessibility-chevron">
                    ▾
                  </span>
                </summary>

                <div className="route-accessibility-content">

                  <p className="route-accessibility-warning">
                    Accessibility unverified
                  </p>

                  <div className="accessibility-info-row">
                    <span>Stairs</span>
                    <strong>
                      {avoidStairs
                        ? "Avoid requested"
                        : "May be present"}
                    </strong>
                  </div>

                  <div className="accessibility-info-row">
                    <span>Slope / surface</span>
                    <strong>Unknown</strong>
                  </div>

                  <div className="accessibility-info-row">
                    <span>Entrances</span>
                    <strong>Not verified</strong>
                  </div>

                  <p className="accessibility-small-note">
                    Route preferences do not guarantee
                    step-free access.
                  </p>

                </div>

              </details>

            </div>
          )}

        </div>

      </main>

    </div>
  );
}

export default App;

