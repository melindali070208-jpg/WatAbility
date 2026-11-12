export type Coordinates = [number, number];

export type SavedRoute = {
  id: string;
  name: string;
  start: string;
  destination: string;
  avoidStairs: boolean;
  waypoints: Coordinates[];
};

const STORAGE_KEY = "accessroute-saved-routes";

function isCoordinate(value: unknown): value is Coordinates {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

export function loadSavedRoutes(): SavedRoute[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item): SavedRoute[] => {
      if (!item || typeof item !== "object") return [];
      const r = item as Record<string, unknown>;

      if (
        typeof r.id !== "string" ||
        typeof r.name !== "string" ||
        typeof r.start !== "string" ||
        typeof r.destination !== "string" ||
        !Array.isArray(r.waypoints) ||
        !r.waypoints.every(isCoordinate)
      ) {
        return [];
      }

      return [{
        id: r.id,
        name: r.name,
        start: r.start,
        destination: r.destination,
        avoidStairs: r.avoidStairs !== false,
        waypoints: r.waypoints as Coordinates[]
      }];
    });
  } catch {
    return [];
  }
}

export function storeSavedRoutes(routes: SavedRoute[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
}
