import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { setAuthToken } from "../services/admin";

export default function Topbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    // ✅ hard clear
    signOut();
    setAuthToken(undefined);
    try {
      localStorage.removeItem("admin_user");
      localStorage.removeItem("admin_token");
      sessionStorage.removeItem("admin_token");
    } catch {}

    navigate("/login", { replace: true });
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="hamburger" aria-label="menu">
          ☰
        </button>
        <h1>Admin Dashboard</h1>
      </div>
      <div className="topbar-right">
        <div className="admin-info">
          <strong>{user?.email}</strong>
        </div>
        <button className="btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}