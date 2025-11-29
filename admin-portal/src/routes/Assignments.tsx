// admin-portal/src/routes/Assignments.tsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  fetchAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  Assignment,
  DirectionKey,
} from "../services/assignments";
import { listRoutes } from "../services/routes";
import { fetchDrivers, fetchVehicles } from "../services/admin";
import api from "../services/admin";

type Option = { id: string; label: string };

export default function Assignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [routes, setRoutes] = useState<Option[]>([]);
  const [drivers, setDrivers] = useState<Option[]>([]);
  const [vehicles, setVehicles] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterRoute, setFilterRoute] = useState<string>("");
  const [filterDriver, setFilterDriver] = useState<string>("");

  const [newRouteId, setNewRouteId] = useState<string>("");
  const [newDirection, setNewDirection] = useState<DirectionKey>("to");
  const [newDriverId, setNewDriverId] = useState<string>("");
  const [newVehicleId, setNewVehicleId] = useState<string>("");

  // ✅ new: hide inactive by default (since backend soft-deletes)
  const [showInactive, setShowInactive] = useState<boolean>(false);

  // ---------------------- initial load ----------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [assignList, routeList, driverList, vehicleList] =
          await Promise.all([
            fetchAssignments({ includeInactive: true }),
            listRoutes(),
            fetchDrivers(),
            fetchVehicles(),
          ]);

        if (cancelled) return;

        const routeOpts: Option[] = (
          Array.isArray(routeList) ? routeList : []
        ).map((r: any) => ({
          id: String(r.id || r.route_id),
          label: r.route_name || r.line || r.route_id || String(r.id),
        }));

        const driverOpts: Option[] = (
          Array.isArray(driverList) ? driverList : []
        ).map((d: any) => ({
          id: String(d.id),
          label: d.name || d.email || d.id,
        }));

        const vehicleOpts: Option[] = (
          Array.isArray(vehicleList) ? vehicleList : []
        )
          .map((v: any) => {
            const id = v.id ? String(v.id) : null;
            if (!id) return null;
            return {
              id,
              label: v.plateNo || v.vehicle_id || id,
            };
          })
          .filter(Boolean) as Option[];

        setAssignments(assignList || []);
        setRoutes(routeOpts);
        setDrivers(driverOpts);
        setVehicles(vehicleOpts);

        if (routeOpts.length && !newRouteId) setNewRouteId(routeOpts[0].id);
        if (driverOpts.length && !newDriverId) setNewDriverId(driverOpts[0].id);
        if (vehicleOpts.length && !newVehicleId)
          setNewVehicleId(vehicleOpts[0].id);
      } catch (err: any) {
        if (cancelled) return;
        console.error("Assignments load error", err);
        setError(
          err?.response?.data?.error ||
            err?.message ||
            "Failed to load assignments"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------- realtime WebSocket for assignment updates ----------------------
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Compute WebSocket URL from API base
    const computeWsUrl = (): string => {
      const base = (api.defaults as any)?.baseURL as string | undefined;
      if (base) {
        try {
          const u = new URL(base);
          const proto = u.protocol === "https:" ? "wss:" : "ws:";
          return `${proto}//${u.host}/ws?role=admin`;
        } catch {
          // fall through
        }
      }
      const { protocol, hostname, port } = window.location;
      const proto = protocol === "https:" ? "wss:" : "ws:";
      const portPart = port ? `:${port}` : "";
      return `${proto}//${hostname}${portPart}/ws?role=admin`;
    };

    const ws = new WebSocket(computeWsUrl());
    wsRef.current = ws;

    ws.onmessage = (event) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type?.toLowerCase();

        // Handle assignment direction changes (globetrotting feature)
        if (type === "assignment_direction_changed" || type === "assignment_updated") {
          const data = msg.data;
          if (data?.id) {
            setAssignments((prev) =>
              prev.map((a) =>
                a.id === data.id
                  ? { ...a, direction: data.direction || a.direction }
                  : a
              )
            );
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      console.warn("Assignments WS error");
    };

    ws.onclose = () => {
      console.warn("Assignments WS closed");
    };

    // Also keep polling as fallback (reduced frequency)
    const poll = async () => {
      try {
        const fresh = await fetchAssignments({ includeInactive: true });
        if (!cancelled) setAssignments(Array.isArray(fresh) ? fresh : []);
      } catch {
        // silent; manual refresh + error banner already exist
      }
    };

    const t0 = window.setTimeout(poll, 1200);
    const t = window.setInterval(poll, 10000); // reduced to 10s since WS handles real-time

    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearInterval(t);
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }, []);

  // ---------------------- derived views ----------------------
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (!showInactive && a.active === false) return false;
      if (filterRoute && a.route_id !== filterRoute) return false;
      if (filterDriver && a.driver_id !== filterDriver) return false;
      return true;
    });
  }, [assignments, filterRoute, filterDriver, showInactive]);

  const routeLabel = (id?: string) =>
    routes.find((r) => r.id === id)?.label || id || "—";
  const driverLabel = (id?: string) =>
    drivers.find((d) => d.id === id)?.label || id || "—";
  const vehicleLabel = (id?: string) =>
    vehicles.find((v) => v.id === id)?.label || id || "—";

  // ---------------------- actions ----------------------
  const handleCreate = async () => {
    if (!newRouteId || !newDriverId || !newVehicleId) {
      alert("Please select route, driver and vehicle.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        route_id: newRouteId,
        direction: newDirection,
        driver_id: newDriverId,
        vehicle_id: newVehicleId,
      } as const;

      const created = await createAssignment(payload);

      // Optimistically mark any other active assignments for this vehicle/driver as inactive
      setAssignments((prev) => {
        const updated = prev.map((a) =>
          (a.driver_id === created.driver_id ||
            a.vehicle_id === created.vehicle_id) &&
          a.id !== created.id
            ? { ...a, active: false }
            : a
        );
        return [...updated, created];
      });
    } catch (err: any) {
      console.error("Create assignment error", err);
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to create assignment"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (a: Assignment) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAssignment(a.id, { active: !a.active });

      setAssignments((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row))
      );
    } catch (err: any) {
      console.error("Update assignment error", err);
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to update assignment"
      );
    } finally {
      setSaving(false);
    }
  };

  // ✅ FIXED: backend soft-deletes → mark inactive locally
  const handleDelete = async (a: Assignment) => {
    if (
      !window.confirm(
        `Delete assignment for route ${a.route_id} (${a.direction})?`
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await deleteAssignment(a.id);

      setAssignments((prev) =>
        prev.map((row) =>
          row.id === a.id ? { ...row, active: false } : row
        )
      );
    } catch (err: any) {
      console.error("Delete assignment error", err);
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to delete assignment"
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------------------- render ----------------------
  return (
    <div>
      <div className="card">
        <h2>Assignments</h2>
        <p className="reports-subtitle">
          Map drivers &amp; vehicles to lines. Changes here update the live
          telemetry and the Routes editor banner. No manual page refresh
          needed.
        </p>

        <div className="form-row" style={{ marginTop: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: "#4b5563" }}>Route</label>
            <br />
            <select
              value={filterRoute}
              onChange={(e) => setFilterRoute(e.target.value)}
            >
              <option value="">All</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} ({r.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#4b5563" }}>Driver</label>
            <br />
            <select
              value={filterDriver}
              onChange={(e) => setFilterDriver(e.target.value)}
            >
              <option value="">All</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn secondary"
            type="button"
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const fresh = await fetchAssignments({ includeInactive: true });
                setAssignments(fresh || []);
              } catch (err: any) {
                console.error("Manual refresh error", err);
                setError(
                  err?.response?.data?.error ||
                    err?.message ||
                    "Failed to refresh assignments"
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            Refresh
          </button>

          {/* ✅ new toggle, default off */}
          <button
            className="btn secondary"
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            style={{ marginLeft: 4 }}
          >
            {showInactive ? "Hide inactive" : "Show inactive"}
          </button>

          {loading && <span className="kv">Loading…</span>}
          {saving && !loading && <span className="kv">Saving…</span>}
          {error && (
            <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Create / Reassign</h3>
        <div className="form-row">
          <div>
            <label style={{ fontSize: 12, color: "#4b5563" }}>Route</label>
            <br />
            <select
              value={newRouteId}
              onChange={(e) => setNewRouteId(e.target.value)}
            >
              <option value="">Select route…</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} ({r.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#4b5563" }}>Direction</label>
            <br />
            <select
              value={newDirection}
              onChange={(e) =>
                setNewDirection(e.target.value as DirectionKey)
              }
            >
              <option value="to">to</option>
              <option value="fro">fro</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#4b5563" }}>Driver</label>
            <br />
            <select
              value={newDriverId}
              onChange={(e) => setNewDriverId(e.target.value)}
            >
              <option value="">Select driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#4b5563" }}>Vehicle</label>
            <br />
            <select
              value={newVehicleId}
              onChange={(e) => setNewVehicleId(e.target.value)}
            >
              <option value="">Select vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn primary"
            type="button"
            disabled={saving}
            onClick={handleCreate}
          >
            {saving ? "Saving…" : "Assign"}
          </button>
        </div>
        <p className="kv">
          Tip: assigning a driver/vehicle to a new line will automatically mark
          their previous assignments inactive in this UI.
        </p>
      </div>

      <div className="card">
        <h3>Current assignments</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Route</th>
              <th>Direction</th>
              <th>Vehicle</th>
              <th>Driver</th>
              <th>Active?</th>
              <th>Created</th>
              <th style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssignments.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ fontSize: 13, color: "#6b7280" }}>
                  No assignments match the current filters.
                </td>
              </tr>
            ) : (
              filteredAssignments.map((a) => (
                <tr key={a.id} style={a.active === false ? { opacity: 0.6 } : {}}>
                  <td>{routeLabel(a.route_id)}</td>
                  <td>{(a.direction || "to").toUpperCase()}</td>
                  <td>{vehicleLabel(a.vehicle_id)}</td>
                  <td>{driverLabel(a.driver_id)}</td>
                  <td>{a.active === false ? "No" : "Yes"}</td>
                  <td>
                    {a.created_at
                      ? new Date(a.created_at).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button
                        className="btn xs"
                        type="button"
                        onClick={() => handleToggleActive(a)}
                        disabled={saving}
                      >
                        {a.active === false ? "Activate" : "Unassign"}
                      </button>
                      <button
                        className="btn xs danger"
                        type="button"
                        onClick={() => handleDelete(a)}
                        disabled={saving}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
