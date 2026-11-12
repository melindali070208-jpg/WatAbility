
import { buildings } from "./buildings";
import type { RouteResult } from "./routes";

type Coordinates = [number, number];

type ApiRoute = {
  geometry?: {
    type?: string;
    coordinates?: number[][];
  };
};

type ApiResponse = {
  routes?: ApiRoute[];
  message?: string;
};

// Retrieve multiple walking route options
export async function findWalkingRoutes(
  start: string,
  destination: string,
  avoidStairs: boolean,
  waypoints: Coordinates[] = []
): Promise<RouteResult[]> {

  const startBuilding = buildings.find(
    (building) => building.id === start
  );

  const endBuilding = buildings.find(
    (building) => building.id === destination
  );

  if (!startBuilding || !endBuilding) {
    return [];
  }

  const [startLon, startLat] =
    startBuilding.coordinates;

  const [endLon, endLat] =
    endBuilding.coordinates;

  const request = {
    locations: [
      { lat: startLat, lon: startLon },
      ...waypoints.map(([lon, lat]) => ({
        lat,
        lon,
        type: "through"
      })),
      { lat: endLat, lon: endLon }
    ],

    costing: "pedestrian",

    costing_options: {
      pedestrian: avoidStairs
        ? {
            type: "wheelchair",
            step_penalty: 3000
          }
        : {}
    },

    format: "osrm",
    shape_format: "geojson",
    units: "km",

    // Ask for up to two additional routes
    // Alternates are only available for two-point routes
    alternates: waypoints.length === 0 ? 2 : 0
  };

  const url =
    "https://valhalla1.openstreetmap.de/route" +
    "?json=" +
    encodeURIComponent(JSON.stringify(request));

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Routing server error: ${response.status}`
    );
  }

  const data: ApiResponse = await response.json();

  console.log(
    "Number of routes returned by Valhalla:",
    data.routes?.length ?? 0
    );

  const routes: RouteResult[] = [];

  for (const apiRoute of data.routes ?? []) {
    const rawCoordinates =
      apiRoute.geometry?.coordinates;

    if (
      !Array.isArray(rawCoordinates) ||
      rawCoordinates.length < 2
    ) {
      continue;
    }

    const validCoordinates = rawCoordinates.every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1])
    );

    if (!validCoordinates) {
      continue;
    }

    const coordinates: Coordinates[] =
      rawCoordinates.map(
        (point) => [point[0], point[1]]
      );

    // Do not display identical routes twice
    const routeKey = JSON.stringify(coordinates);

    const duplicate = routes.some(
      (existing) =>
        JSON.stringify(existing.coordinates) === routeKey
    );

    if (duplicate) {
      continue;
    }

    routes.push({
      nodeIds: coordinates.map(
        (_, index) => `route-${routes.length}-${index}`
      ),
      coordinates,

      // False here is only a compatibility placeholder.
      // Stair status has not been verified.
      containsStairs: false
    });
  }

  return routes;
}

// Keep the old function available for compatibility
export async function findWalkingRoute(
  start: string,
  destination: string,
  avoidStairs: boolean
): Promise<RouteResult | null> {

  const routes = await findWalkingRoutes(
    start,
    destination,
    avoidStairs
  );

  return routes[0] ?? null;
}
