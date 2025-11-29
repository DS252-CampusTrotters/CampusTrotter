// transvahan-user/src/api/alerts-utils.ts
export function normalizeAlertTarget(target: any) {
  if (!target) return "all";
  const s = String(target).toLowerCase().trim();
  if (["user", "users"].includes(s)) return "users";
  if (["driver", "drivers"].includes(s)) return "drivers";
  if (["admin", "admins"].includes(s)) return "admins";
  return "all";
}

/**
 * Returns true if the alert (object with .target) should be shown to role
 * role = 'user' | 'driver' | 'admin'
 */
export function filterAlertForRole(alert: any, role: "user" | "driver" | "admin") {
  const target = normalizeAlertTarget(alert?.target ?? alert?.audience ?? "all");
  if (target === "all") return true;
  if (target === "users" && role === "user") return true;
  if (target === "drivers" && role === "driver") return true;
  if (target === "admins" && role === "admin") return true;
  return false;
}
