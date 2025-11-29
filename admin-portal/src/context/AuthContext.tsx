//admin-portal/src/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from "react";
import { setAuthToken } from "../services/admin";

type User = { email: string; role?: string };

type AuthCtx = {
  user: User | null;
  token: string | null;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem("admin_user");
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem("admin_token");
    } catch {
      return null;
    }
  });

  // Keep localStorage in sync
  useEffect(() => {
    if (token) localStorage.setItem("admin_token", token);
    else localStorage.removeItem("admin_token");

    // Also wire axios default header
    setAuthToken(token || undefined);
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem("admin_user", JSON.stringify(user));
    else localStorage.removeItem("admin_user");
  }, [user]);

  const signIn = (t: string, u: User) => {
    setToken(t);
    setUser(u);
  };

  const signOut = () => {
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, token, signIn, signOut }),
    [user, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
