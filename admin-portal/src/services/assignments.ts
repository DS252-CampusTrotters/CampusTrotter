//admin-portal/src/services/assignments.ts
import api from "./admin";

export type DirectionKey = "to" | "fro";

export interface AssignmentPayload {
  route_id: string;
  direction: DirectionKey;
  vehicle_id: string;
  driver_id: string;
}

export interface Assignment extends AssignmentPayload {
  id: string;
  route_name?: string;
  vehicle_plate?: string;
  driver_name?: string;
  driver_email?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function fetchAssignments(params?: {
  route_id?: string;
  driver_id?: string;
  vehicle_id?: string;
  includeInactive?: boolean;
}): Promise<Assignment[]> {
  const res = await api.get("/assignments", { params });
  const raw = res.data;
  if (Array.isArray(raw)) return raw as Assignment[];
  if (Array.isArray((raw as any)?.assignments))
    return (raw as any).assignments as Assignment[];
  return [];
}

export async function createAssignment(
  payload: AssignmentPayload
): Promise<Assignment> {
  const res = await api.post("/assignments", payload);
  return res.data as Assignment;
}

export async function updateAssignment(
  id: string,
  payload: Partial<AssignmentPayload> & { active?: boolean }
): Promise<Assignment> {
  const res = await api.put(`/assignments/${id}`, payload);
  return res.data as Assignment;
}

export async function deleteAssignment(id: string): Promise<void> {
  await api.delete(`/assignments/${id}`);
}
