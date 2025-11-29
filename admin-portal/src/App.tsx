import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Sidebar from "./components/sidebar";
import Topbar from "./components/topbar";
import Drivers from "./routes/Drivers";
import Vehicles from "./routes/Vehicles";
import Reports from "./routes/Reports";
import Notifications from "./routes/Notifications";
import AdminLogin from "./routes/AdminLogin";
import RoutesEditor from "./routes/RoutesEditor";
import SchedulesEditor from "./routes/SchedulesEditor";
import Assignments from "./routes/Assignments";
import { useAuth } from "./context/AuthContext";

export default function App() {
  const { token } = useAuth();
  const isAuthed = !!token;

  return (
    <Router>
      {/* ✅ Add authed/unauth class so CSS can switch layout safely */}
      <div className={`app-shell ${isAuthed ? "authed" : "unauth"}`}>
        {isAuthed ? (
          <>
            <Sidebar />
            <div className="main-area">
              <Topbar />
              <div className="content">
                <Routes>
                  {/* ✅ Default landing after login */}
                  <Route path="/" element={<Navigate to="/drivers" replace />} />

                  <Route path="/drivers" element={<Drivers />} />
                  <Route path="/vehicles" element={<Vehicles />} />
                  <Route path="/routes" element={<RoutesEditor />} />
                  <Route path="/schedules" element={<SchedulesEditor />} />
                  <Route path="/assignments" element={<Assignments />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/notifications" element={<Notifications />} />

                  {/* Fallback to /drivers */}
                  <Route path="*" element={<Navigate to="/drivers" replace />} />
                </Routes>
              </div>
            </div>
          </>
        ) : (
          // ✅ Unauthed area now fills screen, allowing centered login
          <div className="unauth-area">
            <Routes>
              <Route path="/login" element={<AdminLogin />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </div>
        )}
      </div>
    </Router>
  );
}