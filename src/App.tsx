
import { useState } from "react";
import CampusMap from "./CampusMap";
import { buildings } from "./buildings";
import type { RouteResult } from "./routes";
import { findWalkingRoutes } from "./pedestrianRouting";
import { calculateRouteStats } from "./routeStats";

import {
  loadSavedPaths,
  storeSavedPaths,
  type SavedPath,
  type PathType,
  type StairsStatus
} from "./savedPaths";

import "./App.css";

function App() {
  // ========================================
  // ROUTE SELECTION
  // ========================================

  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [avoidStairs, setAvoidStairs] = useState(true);

  const [message, setMessage] = useState("");
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
  // PATHWAY EDITOR
  // ========================================

  const [editingPaths, setEditingPaths] =
    useState(false);

  const [pathPoints, setPathPoints] =
    useState<[number, number][]>([]);

  const [pathName, setPathName] = useState("");

  const [savedPaths, setSavedPaths] =
    useState<SavedPath[]>(loadSavedPaths);

  const [pathType, setPathType] =
    useState<PathType>("sidewalk");

  const [stairsStatus, setStairsStatus] =
    useState<StairsStatus>("unknown");

  // ========================================
  // FIND AUTOMATIC WALKING ROUTE
  // ========================================

  async function findRoute() {
    if (!start || !destination) {
      setMessage(
        "Please select a starting building and destination."
      );
      setRoute(null);
      setRouteOptions([]);
      return;
    }

    if (start === destination) {
      setMessage("Please select two different buildings.");
      setRoute(null);
      setRouteOptions([]);
      return;
    }

    setMessage("Finding walking routes...");
    setRoute(null);
    setRouteOptions([]);
    setSelectedRouteIndex(0);
    setIsLoading(true);

    try {
      const results = await findWalkingRoutes(
        start,
        destination,
        avoidStairs
      );

      if (results.length === 0) {
        setMessage(
          "No walking routes were found between these buildings."
        );
        return;
      }

      // Save all routes
      setRouteOptions(results);

      // Display the first route initially
      setSelectedRouteIndex(0);
      setRoute(results[0]);

      setMessage(
        results.length > 1
          ? `${results.length} walking routes found. Select an option to compare. Accessibility is unverified.`
          : "Walking route found. No additional alternatives are available. Accessibility is unverified."
      );

    } catch (error) {
      console.error("Routing error:", error);

      setRoute(null);
      setRouteOptions([]);

      setMessage(
        "Could not load walking routes. Please try again."
      );

    } finally {
      setIsLoading(false);
    }
  }


  // ========================================
  // CLEAR CURRENT ROUTE
  // ========================================

  function clearPreviousRoute() {
    setRoute(null);
    setRouteOptions([]);
    setSelectedRouteIndex(0);
    setMessage("");
  }

  // ========================================
  // SAVE A NEW PATHWAY
  // ========================================

  function savePathway() {
    if (pathName.trim() === "") {
      setMessage("Please enter a pathway name.");
      return;
    }

    if (pathPoints.length < 2) {
      setMessage("Add at least two pathway points.");
      return;
    }

    const newPath: SavedPath = {
      id: crypto.randomUUID(),
      name: pathName.trim(),
      coordinates: [...pathPoints],
      accessibility: "unverified",
      pathType,
      stairs: stairsStatus
    };

    const updatedPaths = [...savedPaths, newPath];

    try {
      storeSavedPaths(updatedPaths);

      setSavedPaths(updatedPaths);
      setPathPoints([]);
      setPathName("");
      setPathType("sidewalk");
      setStairsStatus("unknown");

      setMessage("Pathway saved successfully!");

    } catch {
      setMessage(
        "Unable to save. Browser storage may be full."
      );
    }
  }

  // ========================================
  // DELETE SAVED PATHWAY
  // ========================================

  function deletePathway(id: string) {
    const updatedPaths = savedPaths.filter(
      (path) => path.id !== id
    );

    try {
      storeSavedPaths(updatedPaths);
      setSavedPaths(updatedPaths);

      setMessage("Pathway deleted.");

    } catch {
      setMessage("Unable to delete saved pathway.");
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
              Avoid stairs
            </label>

          </div>

          {/* FIND ROUTE BUTTON */}

          <button
            type="button"
            onClick={findRoute}
            disabled={isLoading}
          >
            {isLoading
              ? "Finding route..."
              : "Find Accessible Route"}
          </button>

          {/* STATUS MESSAGE */}
          
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
              PATHWAY EDITOR
             ===================================== */}

          <div className="path-editor">
            <details
              className="path-editor-panel"
              onToggle={(event) => {
                if (!event.currentTarget.open) {
                  setEditingPaths(false);
                }
              }}
            >
              <summary className="path-editor-summary">
                <span>✏️ Pathway Editor</span>
                <span className="path-editor-arrow">⌄</span>
              </summary>

            <p>
              Click along campus sidewalks to
              trace a path.
            </p>

            {/* ENABLE EDITING */}

            <label className="editor-toggle">

              <input
                type="checkbox"
                checked={editingPaths}
                onChange={(e) => {
                  setEditingPaths(e.target.checked);
                  clearPreviousRoute();
                }}
              />

              Enable pathway editing

            </label>

            <p>
              Points added: {pathPoints.length}
            </p>

            {/* PATHWAY NAME */}

            <label htmlFor="pathName">
              Pathway name
            </label>

            <input
              id="pathName"
              type="text"
              className="path-name-input"
              placeholder="e.g. Engineering sidewalk 1"
              value={pathName}
              onChange={(e) =>
                setPathName(e.target.value)
              }
            />

            {/* PATHWAY TYPE */}

            <label htmlFor="pathType">
              Pathway type
            </label>

            <select
              id="pathType"
              value={pathType}
              onChange={(e) =>
                setPathType(
                  e.target.value as PathType
                )
              }
            >
              <option value="sidewalk">
                Sidewalk
              </option>

              <option value="ramp">
                Ramp
              </option>

              <option value="other">
                Other / Unknown
              </option>
            </select>

            {/* STAIRS STATUS */}

            <label htmlFor="stairsStatus">
              Does this pathway contain stairs?
            </label>

            <select
              id="stairsStatus"
              value={stairsStatus}
              onChange={(e) =>
                setStairsStatus(
                  e.target.value as StairsStatus
                )
              }
            >
              <option value="unknown">
                Unknown / Not verified
              </option>

              <option value="no">
                No stairs observed
              </option>

              <option value="yes">
                Stairs present
              </option>
            </select>

            <p className="verification-note">
              These are preliminary observations.
              Pathways remain unverified until
              checked against reliable accessibility
              information.
            </p>

            {/* SAVE PATHWAY */}

            <button
              type="button"
              onClick={savePathway}
              disabled={pathPoints.length < 2}
            >
              Save Pathway
            </button>

            {/* UNDO AND CLEAR BUTTONS */}

            <div className="editor-buttons">

              <button
                type="button"
                disabled={pathPoints.length === 0}
                onClick={() =>
                  setPathPoints((points) =>
                    points.slice(0, -1)
                  )
                }
              >
                Undo
              </button>

              <button
                type="button"
                onClick={() => setPathPoints([])}
              >
                Clear
              </button>

            </div>

            {/* COPY COORDINATES */}

            <button
              type="button"
              disabled={pathPoints.length < 2}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify(
                      pathPoints,
                      null,
                      2
                    )
                  );

                  setMessage(
                    "Path coordinates copied!"
                  );

                } catch {
                  setMessage(
                    "Could not copy coordinates."
                  );
                }
              }}
            >
              Copy coordinates
            </button>

          
            </details>

          </div>

          {/* =====================================
              SAVED PATHWAYS
            ===================================== */}

          <div className="saved-paths">


            <h3>
              Saved Pathways ({savedPaths.length})
            </h3>

            {savedPaths.length === 0 && (
              <p>No pathways saved yet.</p>
            )}

            {savedPaths.map((path) => (
              <div
                className="saved-path"
                key={path.id}
              >

                <div>

                  <strong>
                    {path.name}
                  </strong>

                  <p>
                    {path.coordinates.length} points
                    {" · "}
                    {path.pathType}
                  </p>

                  <p>
                    Stairs:{" "}
                    {path.stairs === "yes"
                      ? "Present"
                      : path.stairs === "no"
                        ? "Not observed"
                        : "Unknown"}
                  </p>

                  <p>
                    Accessibility: Unverified
                  </p>

                </div>

                <button
                  type="button"
                  onClick={() =>
                    deletePathway(path.id)
                  }
                >
                  Delete
                </button>

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

          editingPaths={editingPaths}
          pathPoints={pathPoints}
          savedPaths={savedPaths}

          onAddPoint={(point) => {
            setPathPoints((previous) => [
              ...previous,
              point
            ]);
          }}
        />


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

