import type { RouteResult } from "./routes";

type Coordinates = [number, number];

// Estimate walking speed: 1.2 metres/second
const WALKING_SPEED = 1.2;

// Calculate the distance between two coordinates
function distanceBetween(
  point1: Coordinates,
  point2: Coordinates
): number {

  const earthRadius = 6371000;

  const lat1 = point1[1] * Math.PI / 180;
  const lat2 = point2[1] * Math.PI / 180;

  const deltaLat =
    (point2[1] - point1[1]) * Math.PI / 180;

  const deltaLon =
    (point2[0] - point1[0]) * Math.PI / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(deltaLon / 2) ** 2;

  const c = 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(Math.max(0, 1 - a))
  );

  return earthRadius * c;
}

// Calculate the full route's distance and time
export function calculateRouteStats(
  route: RouteResult
) {

  let totalDistance = 0;

  // Add up every segment of the route
  for (let i = 1; i < route.coordinates.length; i++) {

    totalDistance += distanceBetween(
      route.coordinates[i - 1],
      route.coordinates[i]
    );

  }

  // Convert distance into walking time
  const walkingSeconds =
    totalDistance / WALKING_SPEED;

  const walkingMinutes =
    Math.max(1, Math.ceil(walkingSeconds / 60));

  return {
    distanceMetres: Math.round(totalDistance),
    walkingMinutes
  };
}
