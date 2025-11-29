import { API } from './types';
import { LoginRequest, LoginResponse } from './types';
import { Route, Vehicle, NextArrival } from '../types';


const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));


let vehicles: Vehicle[] = [
{ id: 'v1', vehicle_id: 'SH-01', route_id: 'r1', lat: 13.021, lng: 77.567, occupancy: 2, capacity: 12, status: 'running', updated_at: new Date().toISOString() },
{ id: 'v2', vehicle_id: 'SH-02', route_id: 'r2', lat: 13.015, lng: 77.571, occupancy: 6, capacity: 12, status: 'running', updated_at: new Date().toISOString() },
];


const routes: Route[] = [
{ id: 'r1', name: 'Main Gate ↔ CSA', stops: [
{ id: 's1', name: 'Main Gate', lat: 13.014, lng: 77.567 },
{ id: 's2', name: 'CSA', lat: 13.021, lng: 77.566 },
], schedule: [
  { id: 'sch-r1-1', direction: 'to', startTime: '09:00' },
  { id: 'sch-r1-2', direction: 'to', startTime: '09:20' },
  { id: 'sch-r1-3', direction: 'to', startTime: '09:40' },
  { id: 'sch-r1-4', direction: 'fro', startTime: '10:00' },
] },
{ id: 'r2', name: 'Hostel ↔ Library', stops: [
{ id: 's3', name: 'Hostel', lat: 13.018, lng: 77.573 },
{ id: 's4', name: 'Library', lat: 13.016, lng: 77.566 },
], schedule: [
  { id: 'sch-r2-1', direction: 'to', startTime: '09:10' },
  { id: 'sch-r2-2', direction: 'fro', startTime: '09:30' },
  { id: 'sch-r2-3', direction: 'to', startTime: '09:50' },
  { id: 'sch-r2-4', direction: 'fro', startTime: '10:10' },
] },
];


const nextArrivals: NextArrival[] = [
{ route_id: 'r1', eta_minutes: 6 },
{ route_id: 'r2', eta_minutes: 12 },
];


let wsInterval: any;


export const mockApi: API = {
async login(body: LoginRequest): Promise<LoginResponse> {
await delay(400);
return { token: 'mock-token', user: { id: 'u1', name: 'IISc Rider', email: body.email, role: 'user' } };
},
async getRoutes() { await delay(150); return routes; },
async getVehicles() { await delay(150); return vehicles; },
async getNextArrivals() { await delay(150); return nextArrivals; },
subscribeVehicles(cb) {
// push fake position updates every 3s
wsInterval = setInterval(() => {
vehicles = vehicles.map(v => ({
...v,
lat: v.lat + (Math.random()-0.5) * 0.0005,
lng: v.lng + (Math.random()-0.5) * 0.0005,
occupancy: Math.max(0, Math.min(v.capacity, v.occupancy + (Math.random()>0.7 ? 1 : (Math.random()>0.7 ? -1 : 0)))) ,
updated_at: new Date().toISOString(),
}));
vehicles.forEach(cb);
}, 3000);
return () => clearInterval(wsInterval);
},
};
