//transvahan-user/src/api/types.ts
import { Route, Vehicle, NextArrival, User } from '../types';


export type LoginRequest = { email: string; password: string };
export type LoginResponse = { token: string; user: User };


export type GetRoutesOptions = {
  activeOnly?: boolean; // Filter out schedules that have passed for today
};

export type API = {
login(body: LoginRequest): Promise<LoginResponse>;
getRoutes(options?: GetRoutesOptions): Promise<Route[]>;
getVehicles(): Promise<Vehicle[]>;
getNextArrivals(): Promise<NextArrival[]>;
subscribeVehicles(cb: (v: Vehicle) => void): () => void; // unsubscribe
 subscribeSchedules?(cb: (msg: any) => void): () => void | Promise<() => void>;
};
