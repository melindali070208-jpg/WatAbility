
import { buildings } from "./buildings";
import type { SavedPath } from "./savedPaths";

type Coordinates = [number, number];

export type RouteResult = {
  nodeIds: string[];
  coordinates: Coordinates[];
  containsStairs: boolean;
};

// Distance between two GPS points in metres
function getDistance(
  a: Coordinates,
  b: Coordinates
): number {
  const rad = Math.PI / 180;

  const lat1 = a[1] * rad;
  const lat2 = b[1] * rad;

  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLon / 2) ** 2;

  return 6371000 * 2 * Math.atan2(
    Math.sqrt(h),
    Math.sqrt(Math.max(0, 1 - h))
  );
}

type GraphEdge = {
  to: string;
  distance: number;
  stairs: boolean;
};

type GraphNode = {
  id: string;
  coordinates: Coordinates;
  endpoint: boolean;
  pathId: string;
};

export function findMappedRoute(
  start: string,
  destination: string,
  avoidStairs: boolean,
  savedPaths: SavedPath[]
): RouteResult | null {

  const startBuilding = buildings.find(
    (building) => building.id === start
  );

  const endBuilding = buildings.find(
    (building) => building.id === destination
  );

  if (!startBuilding || !endBuilding) {
    return null;
  }

  const nodes = new Map<string, GraphNode>();
  const graph = new Map<string, GraphEdge[]>();

  function addNode(node: GraphNode) {
    nodes.set(node.id, node);
    graph.set(node.id, []);
  }

  function connect(
    a: string,
    b: string,
    stairs: boolean
  ) {
    const first = nodes.get(a)!;
    const second = nodes.get(b)!;

    const distance = getDistance(
      first.coordinates,
      second.coordinates
    );

    graph.get(a)!.push({ to: b, distance, stairs });
    graph.get(b)!.push({ to: a, distance, stairs });
  }

  // 1. Convert saved pathways into graph nodes
  for (const path of savedPaths) {

    // Exclude stairs and unknown status
    // in step-free demonstration mode.
    if (avoidStairs && path.stairs !== "no") {
      continue;
    }

    path.coordinates.forEach((point, index) => {
      const id = `${path.id}:${index}`;

      addNode({
        id,
        coordinates: point,
        endpoint:
          index === 0 ||
          index === path.coordinates.length - 1,
        pathId: path.id
      });

      if (index > 0) {
        connect(
          `${path.id}:${index - 1}`,
          id,
          path.stairs === "yes"
        );
      }
    });
  }

  // 2. Join nearby pathway endpoints
  const endpoints = [...nodes.values()].filter(
    (node) => node.endpoint
  );

  for (let i = 0; i < endpoints.length; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      const a = endpoints[i];
      const b = endpoints[j];

      if (a.pathId === b.pathId) continue;

      if (getDistance(
        a.coordinates,
        b.coordinates
      ) <= 5) {
        connect(a.id, b.id, false);
      }
    }
  }

  // 3. Add start and destination markers
  addNode({
    id: "__start",
    coordinates: startBuilding.coordinates,
    endpoint: false,
    pathId: "__building"
  });

  addNode({
    id: "__end",
    coordinates: endBuilding.coordinates,
    endpoint: false,
    pathId: "__building"
  });

  // Temporary demonstration connectors:
  // link building centres to nearby endpoints.
  for (const endpoint of endpoints) {
    if (getDistance(
      startBuilding.coordinates,
      endpoint.coordinates
    ) <= 40) {
      connect("__start", endpoint.id, false);
    }

    if (getDistance(
      endBuilding.coordinates,
      endpoint.coordinates
    ) <= 40) {
      connect("__end", endpoint.id, false);
    }
  }

  // 4. Dijkstra's shortest-path algorithm
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const visited = new Set<string>();

  for (const id of nodes.keys()) {
    distances.set(id, Infinity);
  }

  distances.set("__start", 0);

  while (true) {
    let current: string | null = null;
    let smallest = Infinity;

    for (const [id, distance] of distances) {
      if (!visited.has(id) && distance < smallest) {
        current = id;
        smallest = distance;
      }
    }

    if (current === null) break;
    if (current === "__end") break;

    visited.add(current);

    for (const edge of graph.get(current) ?? []) {
      if (visited.has(edge.to)) continue;

      const newDistance = smallest + edge.distance;

      if (newDistance < distances.get(edge.to)!) {
        distances.set(edge.to, newDistance);
        previous.set(edge.to, current);
      }
    }
  }

  if (!Number.isFinite(distances.get("__end"))) {
    return null;
  }

  // 5. Reconstruct the final route
  const routeIds: string[] = [];

  let current = "__end";

  while (current !== "__start") {
    routeIds.unshift(current);

    const parent = previous.get(current);

    if (!parent) return null;

    current = parent;
  }

  routeIds.unshift("__start");

  const routeCoordinates = routeIds.map(
    (id) => nodes.get(id)!.coordinates
  );

  // Determine whether the selected route
  // includes any stair-containing segments.
  let containsStairs = false;

  for (let i = 0; i < routeIds.length - 1; i++) {
    const edge = graph.get(routeIds[i])?.find(
      (item) => item.to === routeIds[i + 1]
    );

    if (edge?.stairs) {
      containsStairs = true;
    }
  }

  return {
    nodeIds: routeIds,
    coordinates: routeCoordinates,
    containsStairs
  };
}
