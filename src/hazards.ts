import type { RouteResult } from "./routes";
import type { Coordinates } from "./savedRoutes";

export type HazardType =
  | "elevator"
  | "construction"
  | "blocked"
  | "curb"
  | "door"
  | "other";

export type Hazard = {
  id: string;
  type: HazardType;
  note: string;
  coordinates: Coordinates;
  reportedAt: string;
};

// avoid = true: the router is told to route around the spot.
// avoid = false: only a warning is shown (e.g. an elevator inside a
// building cannot be routed around).
export const HAZARD_OPTIONS: {
  value: HazardType;
  label: string;
  avoid: boolean;
}[] = [
  { value: "elevator", label: "Elevator out of service", avoid: false },
  { value: "construction", label: "Construction or closure", avoid: true },
  { value: "blocked", label: "Blocked or unsafe path", avoid: true },
  { value: "curb", label: "Missing curb ramp", avoid: true },
  { value: "door", label: "Door opener not working", avoid: false },
  { value: "other", label: "Other barrier", avoid: false }
];

export function hazardLabel(type: HazardType): string {
  return HAZARD_OPTIONS.find((o) => o.value === type)?.label ?? "Issue";
}

function shouldAvoid(type: HazardType): boolean {
  return HAZARD_OPTIONS.find((o) => o.value === type)?.avoid ?? false;
}

const STORAGE_KEY = "accessroute-hazards";

export function loadHazards(): Hazard[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item): Hazard[] => {
      if (!item || typeof item !== "object") return [];
      const h = item as Record<string, unknown>;
      const c = h.coordinates;

      if (
        typeof h.id !== "string" ||
        !HAZARD_OPTIONS.some((o) => o.value === h.type) ||
        typeof h.reportedAt !== "string" ||
        !Array.isArray(c) ||
        c.length !== 2 ||
        !c.every((n) => typeof n === "number" && Number.isFinite(n))
      ) {
        return [];
      }

      return [{
        id: h.id,
        type: h.type as HazardType,
        note: typeof h.note === "string" ? h.note.slice(0, 120) : "",
        coordinates: [c[0], c[1]],
        reportedAt: h.reportedAt
      }];
    });
  } catch {
    return [];
  }
}

export function storeHazards(hazards: Hazard[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hazards));
}

// Local flat-earth metres, accurate enough over a campus
function toMetres(p: Coordinates, origin: Coordinates): [number, number] {
  const x =
    (p[0] - origin[0]) *
    111320 *
    Math.cos((origin[1] * Math.PI) / 180);
  const y = (p[1] - origin[1]) * 111320;
  return [x, y];
}

function distanceToSegment(
  point: Coordinates,
  a: Coordinates,
  b: Coordinates
): number {
  const [px, py] = toMetres(point, point);
  const [ax, ay] = toMetres(a, point);
  const [bx, by] = toMetres(b, point);

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  let t =
    lengthSquared === 0
      ? 0
      : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;

  t = Math.max(0, Math.min(1, t));

  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}

// Reports within limitMetres of any part of the route
export function hazardsNearRoute(
  route: RouteResult,
  hazards: Hazard[],
  limitMetres = 25
): Hazard[] {
  return hazards.filter((hazard) => {
    for (let i = 1; i < route.coordinates.length; i++) {
      if (
        distanceToSegment(
          hazard.coordinates,
          route.coordinates[i - 1],
          route.coordinates[i]
        ) <= limitMetres
      ) {
        return true;
      }
    }
    return false;
  });
}

// A small square (rings of [lon, lat]) around a point
function squareAround(point: Coordinates, radiusMetres: number) {
  const dLat = radiusMetres / 111320;
  const dLon =
    radiusMetres /
    (111320 * Math.cos((point[1] * Math.PI) / 180));
  const [lon, lat] = point;

  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat]
  ];
}

// Areas the router must avoid. Reports too close to the start or
// destination are skipped, or the router could not find any route.
export function avoidAreasFor(
  hazards: Hazard[],
  keepClear: Coordinates[],
  radiusMetres = 12
): number[][][] {
  const clearance = radiusMetres + 30;

  return hazards
    .filter((h) => shouldAvoid(h.type))
    .filter((h) =>
      keepClear.every((p) => {
        const [x, y] = toMetres(h.coordinates, p);
        return Math.hypot(x, y) > clearance;
      })
    )
    .map((h) => squareAround(h.coordinates, radiusMetres));
}
