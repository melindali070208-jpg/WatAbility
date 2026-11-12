import type { RouteResult } from "./routes";
import type { Coordinates } from "./savedRoutes";

// Index of the route vertex closest to a point
function nearestVertex(route: RouteResult, point: Coordinates): number {
  let best = 0;
  let bestDistance = Infinity;

  route.coordinates.forEach((vertex, index) => {
    const d =
      (vertex[0] - point[0]) ** 2 + (vertex[1] - point[1]) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  });

  return best;
}

// Where in the waypoint list a stop dragged out of the line belongs:
// after every existing stop that sits earlier along the route.
export function getInsertIndex(
  route: RouteResult,
  waypoints: Coordinates[],
  grabbedAt: Coordinates
): number {
  const at = nearestVertex(route, grabbedAt);
  return waypoints.filter((wp) => nearestVertex(route, wp) < at).length;
}
