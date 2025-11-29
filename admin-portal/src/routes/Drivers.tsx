// admin-portal/src/routes/Drivers.tsx
import React, { useEffect, useState } from "react";
import {
  fetchDrivers,
  createDriver,
  deleteDriver,
  updateDriver, // kept for future use
  setAuthToken,
} from "../services/admin";
import { useAuth } from "../context/AuthContext";

type Driver = { id: string; name?: string; email?: string };

export default function Drivers() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { token } = useAuth();

  // --------------------------------------------------
  // Load drivers whenever we have / change admin token
  // --------------------------------------------------
  useEffect(() => {
    if (token) {
      setAuthToken(token);
    }
    loadDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadDrivers = async () => {
    console.log("[Drivers] loading…");
    try {
      setLoading(true);
      setError(null);

      const list = await fetchDrivers();
      console.log("[Drivers] fetched:", list);

      setDrivers(Array.isArray(list) ? (list as Driver[]) : []);
    } catch (err: any) {
      console.error("[Drivers] fetch error:", err);
      setDrivers([]);
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to fetch drivers"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const { name, email, password } = form;
    if (!name.trim() || !email.trim() || !password.trim()) {
      alert("Fill name, email and password.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await createDriver({
        name: name.trim(),
        email: email.trim(),
        password: password.trim(),
      });

      setForm({ name: "", email: "", password: "" });
      await loadDrivers();
    } catch (err: any) {
      console.error("[Drivers] create error:", err);
      alert(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to create driver"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete driver? This cannot be undone.")) return;

    try {
      setLoading(true);
      setError(null);

      await deleteDriver(id);
      await loadDrivers();
    } catch (err: any) {
      console.error("[Drivers] delete error:", err);
      alert(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to delete driver"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Manage Drivers</h2>

      {/* Create form */}
      <div className="card form-row" style={{ marginBottom: 16 }}>
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          placeholder="Password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <button className="btn" onClick={handleCreate} disabled={loading}>
          Add Driver
        </button>
      </div>

      {/* List */}
      <div className="card">
        <h3>Drivers</h3>

        {error && (
          <p style={{ color: "#ef4444", marginBottom: 8 }}>Error: {error}</p>
        )}

        {loading ? (
          <p>Loading…</p>
        ) : !drivers.length ? (
          <p>No drivers found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id || d.email}>
                  <td>{d.id}</td>
                  <td>{d.name ?? "—"}</td>
                  <td>{d.email ?? "—"}</td>
                  <td>
                    <button
                      className="btn danger"
                      onClick={() => handleDelete(d.id)}
                      disabled={loading}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
