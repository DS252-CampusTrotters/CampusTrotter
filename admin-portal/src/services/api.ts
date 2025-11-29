//admin-portal/src/services/api.ts
import api from "./admin";

// Thin wrappers that reuse the unified `api` instance.
// Keep these only if some old components still import from "./services/api".

export const getDrivers = () => api.get("/admin/drivers");
export const createDriver = (data: any) => api.post("/admin/drivers", data);
export const deleteDriver = (id: string) => api.delete(`/admin/drivers/${id}`);

export const getVehicles = () => api.get("/vehicle");
export const getUsers = () => api.get("/auth/users");
export const getReports = () => api.get("/admin/analytics");
export const getNotifications = () => api.get("/alerts");

export default api;
