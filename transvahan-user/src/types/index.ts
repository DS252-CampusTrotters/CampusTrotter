// transvahan-user/src/types/index.ts
export type User = { id: string; name: string; email: string; role: 'user' };
export type Stop = { id: string; name: string; lat: number; lng: number; };
export type ScheduleEntry = {
  id: string;
  direction?: 'to' | 'fro';
  startTime: string;
  endTime?: string | null;
  note?: string;
};
export type Route = {
  id: string;
  route_id?: string;
  route_name?: string;
  name?: string;
  line?: string;
  stops?: Stop[];
  directions?: any;
  schedule?: ScheduleEntry[];
  start?: string;
  end?: string;
  [key: string]: any;
};
export type Vehicle = {
id: string;
vehicle_id: string;
route_id: string;
lat: number;
lng: number;
occupancy: number;
capacity: number;
status: 'idle' | 'running' | 'offline';
updated_at: string; // ISO
};
export type NextArrival = { route_id: string; eta_minutes: number };
