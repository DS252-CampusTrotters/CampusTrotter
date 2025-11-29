// src/utils/role.ts
/**
 * Utility to detect current authenticated role
 * (used by ws.ts to connect with correct ?role= parameter)
 */

type AuthContext = {
  isDriver?: boolean;
  isAdmin?: boolean;
};

declare global {
  var __AUTH_CONTEXT__: AuthContext | undefined;
}

export function getCurrentAuthRole(): "user" | "driver" | "admin" | null {
    try {
      // This assumes your AuthContext saves user role globally.
      const ctx = globalThis.__AUTH_CONTEXT__ || null;
  
      if (ctx?.isDriver) return "driver";
      if (ctx?.isAdmin) return "admin";
      return "user";
    } catch (err) {
      console.warn("⚠️ Failed to determine current auth role:", err);
      return null;
    }
  }
  