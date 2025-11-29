// admin-portal/src/routes/SchedulesEditor.tsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  listRoutes,
  getRoute,
  saveSchedule as apiSaveSchedule,
} from "../services/routes";
import "../styles/schedules-editor.css";

type DirectionKey = "to" | "fro";

type ScheduleEntry = {
  id: string;
  direction: DirectionKey;
  startTime: string;
  endTime?: string | null;
  note?: string;
  sequence?: number;
};

type RouteInfo = {
  id: string;
  route_name: string;
};

function normalizeTimeInput(raw: any): string {
  if (raw === null || raw === undefined) return "";
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Math.min(Math.max(parseInt(m[1], 10), 0), 23);
  const min = Math.min(Math.max(parseInt(m[2], 10), 0), 59);
  return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

function normalizeScheduleEntries(raw: any[]): ScheduleEntry[] {
  const rows = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  return rows
    .map((r, idx) => {
      const dir =
        (r.direction || r.dir || "to").toString().toLowerCase() === "fro"
          ? "fro"
          : "to";
      const startTime =
        normalizeTimeInput(
          r.startTime ||
            r.start_time ||
            r.departTime ||
            r.depart_time ||
            r.time
        ) || "";
      const endTime =
        normalizeTimeInput(
          r.endTime || r.end_time || r.arrivalTime || r.arrival_time
        ) || "";
      if (!startTime) return null;
      const id =
        r.id ||
        r.schedule_id ||
        r.trip_id ||
        `sch-${idx}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 8)}`;
      return {
        id: String(id),
        direction: dir as DirectionKey,
        startTime,
        endTime: endTime || null,
        note: r.note || r.label || r.remark || "",
        sequence: Number.isFinite(r.sequence) ? Number(r.sequence) : idx,
      };
    })
    .filter((r): r is ScheduleEntry => !!r)
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === "to" ? -1 : 1;
      return a.startTime.localeCompare(b.startTime);
    })
    .map((r, i) => ({ ...r, sequence: i }));
}

export default function SchedulesEditor() {
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [direction, setDirection] = useState<DirectionKey>("to");
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [allSchedules, setAllSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState("");

  // Load routes list on mount
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
        if (rows.length && !selectedRouteId) {
          setSelectedRouteId(rows[0].id);
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load schedule when route changes
  useEffect(() => {
    if (!selectedRouteId) return;
    (async () => {
      setLoading(true);
      try {
        const full = await getRoute(selectedRouteId);
        const normalized = normalizeScheduleEntries(full?.schedule || []);
        setAllSchedules(normalized);
        setDirty(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedRouteId]);

  // Filter schedules by direction
  const filteredSchedule = useMemo(() => {
    return allSchedules.filter((s) => s.direction === direction);
  }, [allSchedules, direction]);

  // Sorted for display
  const sortedSchedule = useMemo(
    () =>
      [...filteredSchedule].sort((a, b) =>
        a.startTime.localeCompare(b.startTime)
      ),
    [filteredSchedule]
  );

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);

  const filteredRoutes = routes.filter((r) =>
    (r.route_name + " " + r.id).toLowerCase().includes(filter.toLowerCase())
  );

  const addScheduleRow = () => {
    const newEntry: ScheduleEntry = {
      id:
        (crypto as any).randomUUID?.() ||
        `sch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      direction,
      startTime: "08:00",
      endTime: "",
      note: "",
      sequence: allSchedules.length,
    };
    setAllSchedules((rows) => [...rows, newEntry]);
    setDirty(true);
  };

  const updateScheduleRow = useCallback(
    (id: string, patch: Partial<ScheduleEntry>) => {
      setAllSchedules((rows) =>
        rows.map((r) =>
          r.id === id
            ? {
                ...r,
                ...patch,
                startTime:
                  patch.startTime !== undefined
                    ? normalizeTimeInput(patch.startTime)
                    : r.startTime,
                endTime:
                  patch.endTime !== undefined
                    ? normalizeTimeInput(patch.endTime)
                    : r.endTime,
              }
            : r
        )
      );
      setDirty(true);
    },
    []
  );

  const removeScheduleRow = useCallback((id: string) => {
    setAllSchedules((rows) => rows.filter((r) => r.id !== id));
    setDirty(true);
  }, []);

  const persistSchedule = async () => {
    if (!selectedRouteId) {
      alert("Please select a line first.");
      return;
    }
    if (allSchedules.some((s) => !s.startTime)) {
      alert("Every schedule entry needs a start time (HH:MM).");
      return;
    }
    setSaving(true);
    try {
      const clean = normalizeScheduleEntries(allSchedules);
      const saved = await apiSaveSchedule(selectedRouteId, clean);
      setAllSchedules(normalizeScheduleEntries(saved));
      setDirty(false);
      alert("Schedule saved successfully!");
    } catch (err: any) {
      console.error("Save schedule error:", err);
      alert(err?.response?.data?.error || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  const handleRouteChange = (newRouteId: string) => {
    if (dirty) {
      const confirm = window.confirm(
        "You have unsaved changes. Are you sure you want to switch routes?"
      );
      if (!confirm) return;
    }
    setSelectedRouteId(newRouteId);
    setDirty(false);
  };

  const handleDirectionChange = (newDir: DirectionKey) => {
    setDirection(newDir);
  };

  return (
    <div className="schedules-editor">
      <div className="se-header">
        <h1>Schedules</h1>
        <p className="se-subtitle">
          Manage departure and arrival schedules for each line and direction
        </p>
      </div>

      <div className="se-controls">
        <div className="se-control-group">
          <label>Line:</label>
          <input
            placeholder="Search lines..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="se-search"
          />
          <select
            value={selectedRouteId}
            onChange={(e) => handleRouteChange(e.target.value)}
            className="se-select"
          >
            {filteredRoutes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.route_name} ({r.id})
              </option>
            ))}
          </select>
        </div>

        <div className="se-control-group">
          <label>Direction:</label>
          <div className="se-direction-toggle">
            <button
              className={`se-dir-btn ${direction === "to" ? "active" : ""}`}
              onClick={() => handleDirectionChange("to")}
            >
              TO
            </button>
            <button
              className={`se-dir-btn ${direction === "fro" ? "active" : ""}`}
              onClick={() => handleDirectionChange("fro")}
            >
              FRO
            </button>
          </div>
        </div>

        <div className="se-control-group se-actions">
          <button className="btn primary" onClick={addScheduleRow}>
            + Add Schedule
          </button>
          <button
            className="btn success"
            onClick={persistSchedule}
            disabled={saving || !dirty}
          >
            {saving ? "Saving..." : "Save All"}
          </button>
        </div>
      </div>

      {dirty && (
        <div className="se-unsaved-banner">
          You have unsaved changes. Click "Save All" to persist.
        </div>
      )}

      <div className="se-content">
        <div className="se-route-info">
          <h2>
            {selectedRoute?.route_name || "Select a line"} -{" "}
            {direction.toUpperCase()}
          </h2>
          <p>
            {sortedSchedule.length} schedule{sortedSchedule.length !== 1 ? "s" : ""}{" "}
            configured
          </p>
        </div>

        {loading ? (
          <div className="se-loading">Loading schedules...</div>
        ) : sortedSchedule.length === 0 ? (
          <div className="se-empty">
            <p>No schedules configured for this line and direction.</p>
            <p>Click "+ Add Schedule" to create one.</p>
          </div>
        ) : (
          <div className="se-schedule-list">
            <div className="se-schedule-header">
              <span className="se-col-time">Start Time</span>
              <span className="se-col-arrow"></span>
              <span className="se-col-time">End Time</span>
              <span className="se-col-name">Schedule Name</span>
              <span className="se-col-actions">Actions</span>
            </div>
            {sortedSchedule.map((s) => (
              <div key={s.id} className="se-schedule-row">
                <input
                  type="time"
                  value={s.startTime}
                  onChange={(e) =>
                    updateScheduleRow(s.id, { startTime: e.target.value })
                  }
                  className="se-time-input"
                  required
                />
                <span className="se-arrow">→</span>
                <input
                  type="time"
                  value={s.endTime || ""}
                  onChange={(e) =>
                    updateScheduleRow(s.id, { endTime: e.target.value })
                  }
                  className="se-time-input"
                />
                <input
                  type="text"
                  placeholder="Schedule name / note"
                  value={s.note || ""}
                  onChange={(e) =>
                    updateScheduleRow(s.id, { note: e.target.value })
                  }
                  className="se-name-input"
                />
                <div className="se-row-actions">
                  <button
                    className="btn xs danger"
                    onClick={() => removeScheduleRow(s.id)}
                    title="Delete this schedule"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="se-footer">
        <p className="se-hint">
          Schedules define when shuttles depart. Users will see these times in
          the app, and schedules that have passed for the day will be
          automatically hidden until the next day.
        </p>
      </div>
    </div>
  );
}
