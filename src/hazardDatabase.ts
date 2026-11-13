
import { supabase } from "./supabaseClient";
import type { Hazard } from "./hazards";

type ReportRow = {
  id: string;
  type: string;
  longitude: number;
  latitude: number;
  note: string;
  reported_at: string;
  status: string;
};

function toHazard(row: ReportRow): Hazard {
  return {
    id: row.id,
    type: row.type as Hazard["type"],
    coordinates: [row.longitude, row.latitude],
    note: row.note,
    reportedAt: row.reported_at
  };
}

export async function fetchSharedHazards(): Promise<Hazard[]> {
  const { data, error } = await supabase
    .from("accessibility_reports")
    .select("*")
    .in("status", ["active", "pending_verification"])
    .order("reported_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as ReportRow[]).map(toHazard);
}

export async function submitSharedHazard(
  type: Hazard["type"],
  coordinates: [number, number]
): Promise<void> {
  const { error } = await supabase
    .from("accessibility_reports")
    .insert({
      type,
      longitude: coordinates[0],
      latitude: coordinates[1],
      note: ""
    });

  if (error) {
    throw error;
  }
}

export type HazardFeedback =
  | "still_there"
  | "looks_fixed";

export async function submitHazardFeedback(
  hazardId: string,
  feedback: HazardFeedback
): Promise<void> {
  const { error } = await supabase
    .from("hazard_feedback")
    .insert({
      hazard_id: hazardId,
      feedback: feedback
    });

  if (error) {
    throw error;
  }
}
