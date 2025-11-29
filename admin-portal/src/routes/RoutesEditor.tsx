// admin-portal/src/routes/RoutesEditor.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import RouteMapEditor from "../components/RouteMapEditor";
import VehicleLayer from "../components/VehicleLayer";
import DemandLayer from "../components/DemandLayer";

import {
  listRoutes,
  getRoute,
  createRoute,
  updateRoute,
  deleteRoute as apiDeleteRoute,
  deleteStop as apiDeleteStop,
  addStop as apiAddStop,
  updateStop as apiUpdateStop,
} from "../services/routes";
import { fetchAssignments, Assignment } from "../services/assignments";
import { fetchVehicles } from "../services/admin";
import "../styles/route-editor.css";

type DirectionKey = "to" | "fro";

type Stop = {
  stop_id?: string;
  stop_name: string;
  location: { latitude: number; longitude: number };
  sequence?: number;
  [k: string]: any;
};

type AssignmentStatus = {
  route_id: string;
  direction: DirectionKey;
  vehicle_id?: string;
  vehicle_plate?: string;
  driver_id?: string;
  driver_name?: string;
  driver_email?: string;
  status?: string;
  occupancy?: number;
  capacity?: number;
  lat?: number;
  lon?: number;
};

type RouteDoc = {
  id: string;
  route_name: string;
  directions: { to: Stop[]; fro: Stop[] };
};

function emptyRoute(name = "New Line"): RouteDoc {
  return { id: "", route_name: name, directions: { to: [], fro: [] } };
}

function toStops(arr: any[], idPrefix: string): Stop[] {
  return (arr || []).map((s: any, i: number) => ({
    stop_id: s.stop_id || s.id || `${idPrefix}-${i}`,
    stop_name: s.stop_name || s.name || `Stop ${i + 1}`,
    location: {
      latitude: Number(s.lat ?? s.location?.latitude ?? 0),
      longitude: Number(s.lon ?? s.lng ?? s.location?.longitude ?? 0),
    },
    sequence: Number.isFinite(s.sequence) ? Number(s.sequence) : i,
    ...Object.fromEntries(
      Object.entries(s || {}).filter(([k]) =>
        ![
          "stop_id",
          "id",
          "stop_name",
          "name",
          "lat",
          "lon",
          "lng",
          "sequence",
          "location",
        ].includes(k)
      )
    ),
  }));
}

function normalize(full: any): RouteDoc {
  const id = String(full.id ?? "");
  const name = full.route_name || full.line || full.routeName || id || "Route";
  const to = toStops(full?.directions?.to || [], `${id}-to`);
  const fro = toStops(full?.directions?.fro || [], `${id}-fro`);
  return {
    id,
    route_name: name,
    directions: { to, fro },
  };
}

const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#ef4444",
  "#f59e0b",
  "#a855f7",
  "#0891b2",
  "#f43f5e",
  "#22c55e",
  "#0ea5e9",
  "#eab308",
];

function colorFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function reverseStops(stops: Stop[]): Stop[] {
  const rev = [...stops].reverse();
  return rev.map((s, i) => ({ ...s, sequence: i }));
}

export default function RoutesEditor() {
  const [routes, setRoutes] = useState<{ id: string; route_name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [model, setModel] = useState<RouteDoc>(emptyRoute());
  const [dir, setDir] = useState<DirectionKey>("to");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoReverse, setAutoReverse] = useState(true);
  const [filter, setFilter] = useState("");

  const [overlays, setOverlays] = useState<
    { id: string; name: string; color: string; to: Stop[]; fro: Stop[] }[]
  >([]);

  const [liveVehicles, setLiveVehicles] = useState<any[]>([]);
  const [demandPoints, setDemandPoints] = useState<any[]>([]);

  const [assignStatus, setAssignStatus] = useState<AssignmentStatus | null>(
    null
  );
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleVehicleData = useCallback((rows: any[]) => {
    setLiveVehicles(rows);
  }, []);

  const handleDemandData = useCallback((points: any[]) => {
    setDemandPoints(points);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await listRoutes();
        const arr = Array.isArray(list) ? list : [];
        const rows = arr.map((r: any) => ({
          id: String(r.id || r.route_id),
          route_name: r.route_name || r.line || r.route_id || "Route",
        }));
        setRoutes(rows);
        if (rows.length && !selectedId) setSelectedId(rows[0].id);

        const details = await Promise.all(
          rows.map(async (r) => {
            try {
              const full = await getRoute(r.id);
              const n = normalize(full);
              return {
                id: n.id,
                name: n.route_name,
                color: colorFor(n.id || n.route_name),
                to: n.directions.to,
                fro: n.directions.fro,
              };
            } catch {
              return null;
            }
          })
        );
        setOverlays(details.filter(Boolean) as any[]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      setLoading(true);
      try {
        const full = await getRoute(selectedId);
        const n = normalize(full);
        setModel(n);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setAssignStatus(null);
      setAssignError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setAssignLoading(true);
        setAssignError(null);

        const [assignments, vehicles] = await Promise.all([
          fetchAssignments({ route_id: selectedId, includeInactive: true }),
          fetchVehicles(),
        ]);

        if (cancelled) return;

        const list: Assignment[] = Array.isArray(assignments) ? assignments : [];
        const active = list.find(
          (a) =>
            a.route_id === selectedId &&
            (a.direction as DirectionKey) === dir &&
            a.active !== false
        );

        if (!active) {
          setAssignStatus(null);
          return;
        }

        const vList = Array.isArray(vehicles) ? vehicles : [];
        const veh = vList.find((vv: any) => vv.id === active.vehicle_id);

        const status: AssignmentStatus = {
          route_id: active.route_id,
          direction: active.direction as DirectionKey,
          vehicle_id: active.vehicle_id,
          vehicle_plate:
            (active as any).vehicle_plate ||
            veh?.plateNo ||
            veh?.vehicle_id ||
            active.vehicle_id,
          driver_id: active.driver_id,
          driver_name: (active as any).driver_name,
          driver_email: (active as any).driver_email,
          status: veh?.status,
          occupancy:
            typeof veh?.occupancy === "number" ? veh.occupancy : undefined,
          capacity:
            typeof veh?.capacity === "number" ? veh.capacity : undefined,
          lat: veh?.location?.lat ?? veh?.location?.latitude ?? undefined,
          lon:
            veh?.location?.lon ??
            veh?.location?.lng ??
            veh?.location?.longitude ??
            undefined,
        };

        setAssignStatus(status);
      } catch (err: any) {
        if (cancelled) return;
        console.error("Assignment status fetch error:", err);
        setAssignStatus(null);
        setAssignError(
          err?.response?.data?.error ||
            err?.message ||
            "Failed to load assignment status"
        );
      } finally {
        if (!cancelled) setAssignLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, dir]);

  const currentStops = useMemo<Stop[]>(
    () =>
      (model?.directions?.[dir] || []).map((s, i) => ({
        ...s,
        sequence: i,
      })),
    [model, dir]
  );

  const addNewLine = async () => {
    const name = prompt("Enter new line name:", "New Line");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const created = await createRoute({ route_name: trimmed });

    const row = { id: created.id, route_name: trimmed };
    setRoutes((r) => [...r, row]);
    setSelectedId(created.id);

    setModel({
      id: created.id,
      route_name: trimmed,
      directions: { to: [], fro: [] },
    });

    setOverlays((o) => [
      ...o,
      {
        id: created.id,
        name: trimmed,
        color: colorFor(created.id),
        to: [],
        fro: [],
      },
    ]);
    setDir("to");
  };

  const deleteLine = async () => {
    if (!model?.id) return;
    if (!confirm(`Delete line "${model.route_name}"? This cannot be undone.`))
      return;
    await apiDeleteRoute(model.id);
    const next = routes.filter((x) => x.id !== model.id);
    setRoutes(next);
    setOverlays((o) => o.filter((x) => x.id !== model.id));
    setModel(emptyRoute());
    setSelectedId(next[0]?.id || "");
  };

  const renameLine = async () => {
    const name = prompt("Rename line:", model.route_name);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const routeId = model.id || selectedId;
    const prevName = model.route_name;

    setModel((m) => ({ ...m, route_name: trimmed }));
    setRoutes((rs) =>
      rs.map((r) => (r.id === routeId ? { ...r, route_name: trimmed } : r))
    );
    setOverlays((os) =>
      os.map((o) => (o.id === routeId ? { ...o, name: trimmed } : o))
    );

    if (!routeId) return;

    try {
      await updateRoute(routeId, { route_name: trimmed });
    } catch (err: any) {
      console.error("Rename route failed:", err);
      alert(err?.response?.data?.error || "Failed to rename line");

      setModel((m) => ({ ...m, route_name: prevName }));
      setRoutes((rs) =>
        rs.map((r) => (r.id === routeId ? { ...r, route_name: prevName } : r))
      );
      setOverlays((os) =>
        os.map((o) => (o.id === routeId ? { ...o, name: prevName } : o))
      );
    }
  };

  const onAddStopAt = (lat: number, lon: number) => {
    const ok = window.confirm("Add a stop ?");
    if (!ok) {
      console.log("[RoutesEditor] User cancelled Add Stop");
      return;
    }

    const rawName = window.prompt(
      "Stop name:",
      `Stop ${currentStops.length + 1}`
    );
    if (rawName == null) {
      console.log("[RoutesEditor] User cancelled stop naming");
      return;
    }

    const label = rawName.trim();
    if (!label) {
      console.log("[RoutesEditor] Empty stop name, aborting");
      return;
    }

    if (!model.id) {
      const stop: Stop = {
        stop_id: crypto.randomUUID(),
        stop_name: label,
        location: { latitude: lat, longitude: lon },
        sequence: currentStops.length,
      };
      setModel((m) => ({
        ...m,
        directions: {
          ...m.directions,
          [dir]: [...(m.directions[dir] || []), stop],
        },
      }));
      return;
    }

    (async () => {
      try {
        const created = await apiAddStop(model.id, {
          direction: dir,
          stop_name: label,
          latitude: lat,
          longitude: lon,
        });

        const normalized: Stop = {
          stop_id: created.stop_id || created.id || crypto.randomUUID(),
          stop_name: created.stop_name || label,
          location: {
            latitude: created.location?.latitude ?? created.lat ?? lat,
            longitude:
              created.location?.longitude ??
              created.lon ??
              created.lng ??
              lon,
          },
          sequence:
            typeof created.sequence === "number"
              ? created.sequence
              : currentStops.length,
          ...created,
        };

        setModel((m) => ({
          ...m,
          directions: {
            ...m.directions,
            [dir]: [...(m.directions[dir] || []), normalized],
          },
        }));
      } catch (err: any) {
        console.error("Add stop error:", err);
        alert(err?.response?.data?.error || "Failed to add stop");
      }
    })();
  };

  const onMarkerMove = (_stop_id: string, _lat: number, _lon: number) => {
    // compatibility; stops are non-draggable
  };

  // ✅ FIXED: rename stop now persists to backend + rolls back on failure
  const onRenameStop = (stop_id: string) => {
    const s = currentStops.find((x) => x.stop_id === stop_id);
    if (!s) return;

    const name = prompt("Edit stop name:", s.stop_name);
    if (name == null) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    const prevName = s.stop_name;

    // optimistic UI update
    setModel((m) => ({
      ...m,
      directions: {
        ...m.directions,
        [dir]: (m.directions[dir] || []).map((x) =>
          x.stop_id === stop_id ? { ...x, stop_name: trimmed } : x
        ),
      },
    }));

    // if no backend id yet, local-only is fine
    if (!model.id) return;

    (async () => {
      try {
        await apiUpdateStop(model.id, stop_id, {
          direction: dir,
          stop_name: trimmed,
        });
      } catch (err: any) {
        console.error("Rename stop error:", err);
        alert(err?.response?.data?.error || "Failed to rename stop on server");

        // rollback UI
        setModel((m) => ({
          ...m,
          directions: {
            ...m.directions,
            [dir]: (m.directions[dir] || []).map((x) =>
              x.stop_id === stop_id ? { ...x, stop_name: prevName } : x
            ),
          },
        }));
      }
    })();
  };

  const onDeleteStop = (stop_id: string) => {
    (async () => {
      if (!model?.id) return;

      const s = currentStops.find((x) => x.stop_id === stop_id);
      const label = s?.stop_name || "this stop";
      const confirmMsg = `Delete "${label}" from ${dir.toUpperCase()}? This cannot be undone.`;
      if (!window.confirm(confirmMsg)) return;

      try {
        await apiDeleteStop(model.id, stop_id, dir);
      } catch (err: any) {
        console.error("Delete stop error:", err);
        alert(err?.response?.data?.error || "Failed to delete stop on server");
        return;
      }

      setModel((m) => ({
        ...m,
        directions: {
          ...m.directions,
          [dir]: (m.directions[dir] || [])
            .filter((x) => x.stop_id !== stop_id)
            .map((s, i) => ({ ...s, sequence: i })),
        },
      }));
    })();
  };

  const moveStopToIndex = (stop_id: string, targetIndex: number) => {
    const arr = [...currentStops];
    const fromIndex = arr.findIndex((s) => s.stop_id === stop_id);
    if (fromIndex < 0) return;
    if (targetIndex < 0 || targetIndex >= arr.length) return;
    if (fromIndex === targetIndex) return;

    const [moved] = arr.splice(fromIndex, 1);
    arr.splice(targetIndex, 0, moved);

    const renum = arr.map((s, idx) => ({ ...s, sequence: idx }));

    setModel((m) => ({
      ...m,
      directions: { ...m.directions, [dir]: renum },
    }));

    if (!model.id) return;

    (async () => {
      try {
        await apiUpdateStop(model.id, stop_id, {
          direction: dir,
          sequence: targetIndex,
        });
      } catch (err) {
        console.error("Reorder stop error:", err);
      }
    })();
  };

  const moveStop = (stop_id: string, delta: number) => {
    const arr = [...currentStops];
    const fromIndex = arr.findIndex((s) => s.stop_id === stop_id);
    if (fromIndex < 0) return;
    const targetIndex = fromIndex + delta;
    moveStopToIndex(stop_id, targetIndex);
  };

  const save = async () => {
    if (!model.route_name?.trim()) {
      alert("Route name is required.");
      return;
    }

    const routeId = model.id || selectedId;
    if (!routeId) {
      alert("Missing route id; cannot save.");
      return;
    }

    setSaving(true);
    try {
      const to = (model.directions.to || []).map((s, i) => ({
        ...s,
        stop_id: s.stop_id || crypto.randomUUID(),
        stop_name: s.stop_name,
        location: {
          latitude: s.location.latitude,
          longitude: s.location.longitude,
        },
        sequence: i,
      }));
      const fro = autoReverse
        ? reverseStops(to)
        : (model.directions.fro || []).map((s, i) => ({
            ...s,
            stop_id: s.stop_id || crypto.randomUUID(),
            stop_name: s.stop_name,
            location: {
              latitude: s.location.latitude,
              longitude: s.location.longitude,
            },
            sequence: i,
          }));

      await updateRoute(routeId, {
        route_name: model.route_name,
        directions: { to, fro },
      });

      setOverlays((os) =>
        os.map((o) =>
          o.id === routeId
            ? {
                ...o,
                id: routeId,
                name: model.route_name,
                to,
                fro,
                color: o.color || colorFor(routeId || model.route_name),
              }
            : o
        )
      );

      setModel((m) => ({ ...m, id: routeId }));

      alert("Saved!");
    } catch (e: any) {
      console.error(e);
      alert(e?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const primaryColor = colorFor(model.id || model.route_name);
  const filteredRoutes = routes.filter((r) =>
    (r.route_name + " " + r.id).toLowerCase().includes(filter.toLowerCase())
  );

  const overlaysForMap = overlays;

  const viewStops = useMemo<Stop[]>(() => {
    if (dir === "to")
      return (model.directions.to || []).map((s, i) => ({
        ...s,
        sequence: i,
      }));
    if (autoReverse) return reverseStops(model.directions.to || []);
    return (model.directions.fro || []).map((s, i) => ({
      ...s,
      sequence: i,
    }));
  }, [dir, model, autoReverse]);

  const froReadonly = dir === "fro" && autoReverse;

  return (
    <div className="route-editor">
      <div className="re-header">
        <div className="row" style={{ gap: 10 }}>
          <div className="col">
            <label>Line:</label>
            <input
              placeholder="Search lines…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                padding: "6px 8px",
                border: "1px solid #ddd",
                borderRadius: 6,
              }}
            />
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{ marginLeft: 8 }}
            >
              {filteredRoutes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.route_name} ({r.id})
                </option>
              ))}
            </select>
            <button className="btn" onClick={addNewLine}>
              + New Line
            </button>
          </div>

          <div className="col">
            <label>Direction:</label>
            <div className="seg">
              <button
                className={`seg-btn ${dir === "to" ? "active" : ""}`}
                onClick={() => setDir("to")}
              >
                to
              </button>
              <button
                className={`seg-btn ${dir === "fro" ? "active" : ""}`}
                onClick={() => setDir("fro")}
              >
                fro
              </button>
            </div>
          </div>

          <div className="col">
            <label style={{ marginRight: 6 }}>Auto-reverse fro</label>
            <input
              type="checkbox"
              checked={autoReverse}
              onChange={(e) => setAutoReverse(e.target.checked)}
            />
          </div>

          <div className="col grow" />
          <div className="col align-right">
            <button className="btn secondary" onClick={renameLine}>
              Rename Line
            </button>
            <button className="btn danger" onClick={deleteLine}>
              Delete Line
            </button>
            <button className="btn primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div
          className="assignment-banner"
          style={{
            marginTop: 8,
            padding: "10px 14px",
            borderRadius: 10,
            background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
            fontSize: 13,
            border: "1px solid #bfdbfe",
          }}
        >
          <strong>Assignment ({dir.toUpperCase()}): </strong>
          {assignLoading ? (
            <span>Loading…</span>
          ) : assignError ? (
            <span style={{ color: "#b91c1c" }}>Error: {assignError}</span>
          ) : !assignStatus ? (
            <span>No active vehicle assigned for this direction.</span>
          ) : (
            <span>
              Vehicle:{" "}
              <b>
                {assignStatus.vehicle_plate || assignStatus.vehicle_id || "—"}
              </b>{" "}
              | Driver ID: <b>{assignStatus.driver_id || "—"}</b>{" "}
              {assignStatus.driver_name
                ? `(${assignStatus.driver_name}${
                    assignStatus.driver_email
                      ? ` · ${assignStatus.driver_email}`
                      : ""
                  })`
                : ""}
              {"  | "}
              Status:{" "}
              <b>{(assignStatus.status || "unknown").toUpperCase()}</b>
              {typeof assignStatus.occupancy === "number" &&
                typeof assignStatus.capacity === "number" && (
                  <>
                    {" "}
                    · Occupancy:{" "}
                    <b>
                      {assignStatus.occupancy}/{assignStatus.capacity}
                    </b>
                  </>
                )}
              {typeof assignStatus.lat === "number" &&
                typeof assignStatus.lon === "number" && (
                  <>
                    {" "}
                    · Location:{" "}
                    <span>
                      {assignStatus.lat.toFixed(5)},{" "}
                      {assignStatus.lon.toFixed(5)}
                    </span>
                  </>
                )}
            </span>
          )}
        </div>
      </div>

      <div className="re-body">
        <div className="map-col">
          <VehicleLayer
            routeId={selectedId}
            direction={dir}
            assignedVehicleId={assignStatus?.vehicle_id}
            onData={handleVehicleData}
          />

          <DemandLayer
            routeId={selectedId}
            direction={dir}
            onData={handleDemandData}
          />

          <RouteMapEditor
            routeId={model.id || selectedId}
            direction={dir}
            stops={viewStops}
            primaryColor={primaryColor}
            overlays={overlaysForMap}
            vehicles={liveVehicles}
            demands={demandPoints}
            onMapClick={froReadonly ? () => {} : onAddStopAt}
            onMarkerMove={froReadonly ? () => {} : onMarkerMove}
            onRenameStop={froReadonly ? () => {} : onRenameStop}
            onDeleteStop={froReadonly ? () => {} : onDeleteStop}
            loading={loading}
          />
          {froReadonly && (
            <div className="map-loading" style={{ left: 10 }}>
              fro is auto-reversed from to (toggle off to edit)
            </div>
          )}
        </div>

        <div className="list-col">
          <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: primaryColor,
                display: "inline-block",
              }}
            />
            {model.route_name} — {dir.toUpperCase()}
          </h3>
          <ol
            className="stops"
            onDragOver={(e) => {
              if (!draggingId || froReadonly) return;
              e.preventDefault();
            }}
            onDrop={(e) => {
              if (!draggingId || froReadonly) return;
              e.preventDefault();
              const targetIndex = currentStops.length - 1;
              moveStopToIndex(draggingId, targetIndex);
              setDraggingId(null);
            }}
          >
            {viewStops.map((s) => (
              <li
                key={s.stop_id}
                draggable={!froReadonly}
                onDragStart={(e) => {
                  if (froReadonly) return;
                  if (!s.stop_id) return;
                  setDraggingId(s.stop_id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (!draggingId || froReadonly) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  if (!draggingId || froReadonly) return;
                  e.preventDefault();
                  const targetIndex = currentStops.findIndex(
                    (cs) => cs.stop_id === s.stop_id
                  );
                  if (targetIndex >= 0) {
                    moveStopToIndex(draggingId, targetIndex);
                  }
                  setDraggingId(null);
                }}
                onDragEnd={() => setDraggingId(null)}
              >
                <div className="stop-row">
                  <div className="stop-main">
                    <div className="stop-name">{s.stop_name}</div>
                    <div className="stop-sub">
                      {s.location.latitude.toFixed(5)},{" "}
                      {s.location.longitude.toFixed(5)}
                    </div>
                  </div>
                  <div className="stop-actions">
                    <button
                      className="btn xs"
                      disabled={froReadonly}
                      onClick={() => moveStop(s.stop_id!, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="btn xs"
                      disabled={froReadonly}
                      onClick={() => moveStop(s.stop_id!, +1)}
                    >
                      ↓
                    </button>
                    <button
                      className="btn xs"
                      disabled={froReadonly}
                      onClick={() => onRenameStop(s.stop_id!)}
                    >
                      Rename
                    </button>
                    <button
                      className="btn xs danger"
                      disabled={froReadonly}
                      onClick={() => onDeleteStop(s.stop_id!)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="hint">
            Tip: drag stops in the list to reorder (or use ↑ / ↓ for fine
            adjustments). Click a stop marker on the map to rename, right-click
            to delete.
          </p>
        </div>
      </div>
    </div>
  );
}
