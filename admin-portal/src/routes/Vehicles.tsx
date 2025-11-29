import React, { useEffect, useState } from "react";
import {
  fetchVehicles,
  updateVehicleCapacity,
  createVehicle,
  deleteVehicle,
} from "../services/admin";

type Vehicle = {
  id: string;
  vehicle_id?: string;
  plateNo?: string;
  status?: string;
  occupancy?: number;
  capacity?: number;
  demand_high?: boolean;
};

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ [id: string]: number }>({});
  const [saving, setSaving] = useState<string | null>(null);

  // ✅ create form state
  const [newPlate, setNewPlate] = useState("");
  const [newCapacity, setNewCapacity] = useState<number>(12);

  const loadVehicles = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await fetchVehicles();
      setVehicles(Array.isArray(list) ? list : []);
    } catch (err: any) {
      console.error("Failed to fetch vehicles:", err);
      setVehicles([]);
      setError(
        err?.response?.data?.error || err?.message || "Failed to fetch vehicles"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const handleCapacityChange = (id: string, value: string) => {
    const num = parseInt(value, 10);
    setEditing((prev) => ({ ...prev, [id]: isNaN(num) ? 0 : num }));
  };

  const handleSaveCapacity = async (id: string) => {
    const newCap = editing[id];
    if (!newCap || newCap < 1) {
      alert("Please enter a valid capacity (>=1)");
      return;
    }
    try {
      setSaving(id);
      await updateVehicleCapacity(id, newCap);
      await loadVehicles();
    } catch (err: any) {
      console.error("Update capacity error:", err);
      alert(err?.response?.data?.error || "Failed to update capacity");
    } finally {
      setSaving(null);
    }
  };

  const handleCreateVehicle = async () => {
    if (!newPlate.trim()) {
      alert("Enter a vehicle plate / id");
      return;
    }
    if (!newCapacity || newCapacity < 1) {
      alert("Capacity must be >= 1");
      return;
    }

    try {
      setSaving("create");
      await createVehicle({
        plateNo: newPlate.trim(),
        vehicle_id: newPlate.trim(),
        capacity: newCapacity,
        status: "idle",
      });
      setNewPlate("");
      setNewCapacity(12);
      await loadVehicles();
    } catch (err: any) {
      console.error("Create vehicle error:", err);
      alert(err?.response?.data?.error || "Failed to create vehicle");
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteVehicle = async (v: Vehicle) => {
    if (!window.confirm(`Delete vehicle ${v.vehicle_id || v.plateNo || v.id}?`))
      return;

    try {
      setSaving(v.id);
      await deleteVehicle(v.id);
      setVehicles((prev) => prev.filter((x) => x.id !== v.id));
    } catch (err: any) {
      console.error("Delete vehicle error:", err);
      alert(err?.response?.data?.error || "Failed to delete vehicle");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <h2>Vehicles</h2>

      {/* ✅ Create Vehicle */}
      <div className="card form-row" style={{ marginBottom: 12 }}>
        <input
          placeholder="Vehicle Plate / ID"
          value={newPlate}
          onChange={(e) => setNewPlate(e.target.value)}
        />
        <input
          type="number"
          min={1}
          placeholder="Capacity"
          value={newCapacity}
          onChange={(e) => setNewCapacity(parseInt(e.target.value, 10) || 0)}
          style={{ width: 120 }}
        />
        <button
          className="btn primary"
          onClick={handleCreateVehicle}
          disabled={saving === "create"}
        >
          {saving === "create" ? "Adding…" : "+ Add Vehicle"}
        </button>
      </div>

      <div className="card">
        {error && <p style={{ color: "#ef4444" }}>Error: {error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Plate</th>
                <th>Status</th>
                <th>Occupancy</th>
                <th>Capacity</th>
                <th>Demand</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(vehicles || []).map((v) => (
                <tr key={v.id}>
                  <td>{v.id}</td>
                  <td>{v.vehicle_id ?? v.plateNo ?? "—"}</td>
                  <td>{v.status ?? "—"}</td>
                  <td>{typeof v.occupancy === "number" ? v.occupancy : "—"}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={
                        editing[v.id] !== undefined
                          ? editing[v.id]
                          : v.capacity ?? ""
                      }
                      onChange={(e) =>
                        handleCapacityChange(v.id, e.target.value)
                      }
                      style={{
                        width: 70,
                        textAlign: "center",
                        padding: "4px 6px",
                        border: "1px solid #ccc",
                        borderRadius: 4,
                      }}
                    />
                  </td>
                  <td>{v.demand_high ? "✅" : "—"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn xs primary"
                      disabled={saving === v.id}
                      onClick={() => handleSaveCapacity(v.id)}
                    >
                      {saving === v.id ? "Saving…" : "💾 Save"}
                    </button>
                    <button
                      className="btn xs danger"
                      disabled={saving === v.id}
                      onClick={() => handleDeleteVehicle(v)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!vehicles?.length && !error && (
                <tr>
                  <td colSpan={7}>No vehicles found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}