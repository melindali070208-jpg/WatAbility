
export type PathType =
  | "sidewalk"
  | "ramp"
  | "other";

export type StairsStatus =
  | "yes"
  | "no"
  | "unknown";

export type SavedPath = {
  id: string;
  name: string;
  coordinates: [number, number][];
  accessibility: "unverified";
  pathType: PathType;
  stairs: StairsStatus;
};

const STORAGE_KEY = "accessroute-paths";

export function loadSavedPaths(): SavedPath[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);

    if (!data) return [];

    const parsed: unknown = JSON.parse(data);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => {
        if (!item || typeof item !== "object") {
          return false;
        }

        const path = item as Record<string, unknown>;

        return (
          typeof path.id === "string" &&
          typeof path.name === "string" &&
          Array.isArray(path.coordinates) &&
          path.coordinates.length >= 2 &&
          path.coordinates.every(
            (point: unknown) =>
              Array.isArray(point) &&
              point.length === 2 &&
              point.every(
                (value: unknown) =>
                  typeof value === "number" &&
                  Number.isFinite(value)
              )
          )
        );
      })
      .map((item) => {
        const path = item as SavedPath;

        return {
          id: path.id,
          name: path.name,
          coordinates: path.coordinates,
          accessibility: "unverified" as const,

          pathType:
            path.pathType === "sidewalk" ||
            path.pathType === "ramp" ||
            path.pathType === "other"
              ? path.pathType
              : "other" as const,

          stairs:
            path.stairs === "yes" ||
            path.stairs === "no"
              ? path.stairs
              : "unknown" as const
        };
      });
  } catch {
    return [];
  }
}

export function storeSavedPaths(paths: SavedPath[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(paths)
  );
}
