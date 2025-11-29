//admin-portal/src/components/sidebar.tsx
import React from "react";
import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">Transvahan — Admin</div>

      <nav className="nav">
        {/* ✅ Dashboard removed */}
        {/* ✅ Users removed */}

        <NavLink
          to="/reports"
          className={({ isActive }) =>
            isActive ? "nav-item active" : "nav-item"
          }
        >
          Reports
        </NavLink>

        <NavLink
          to="/drivers"
          className={({ isActive }) =>
            isActive ? "nav-item active" : "nav-item"
          }
        >
          Drivers
        </NavLink>

        <NavLink
          to="/vehicles"
          className={({ isActive }) =>
            isActive ? "nav-item active" : "nav-item"
          }
        >
          Vehicles
        </NavLink>

        <NavLink
          to="/routes"
          className={({ isActive }) =>
            isActive ? "nav-item active" : "nav-item"
          }
        >
          Routes
        </NavLink>

        <NavLink
          to="/schedules"
          className={({ isActive }) =>
            isActive ? "nav-item active" : "nav-item"
          }
        >
          Schedules
        </NavLink>

        <NavLink
          to="/assignments"
          className={({ isActive }) =>
            isActive ? "nav-item active" : "nav-item"
          }
        >
          Assignments
        </NavLink>

        <NavLink
          to="/notifications"
          className={({ isActive }) =>
            isActive ? "nav-item active" : "nav-item"
          }
        >
          Notifications
        </NavLink>
      </nav>

      <div style={{ flex: 1 }} />
      <div className="sidebar-foot">Version 0.1</div>
    </aside>
  );
}