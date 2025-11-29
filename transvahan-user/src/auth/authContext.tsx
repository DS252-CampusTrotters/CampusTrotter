// src/auth/authContext.tsx
import React, { createContext, useContext, useState } from "react";
import { setToken as setApiToken } from "../api/client";
import { User } from "../types";

interface Ctx {
  user: User | null;
  token: string | null;
  isDriver: boolean;
  signIn: (token: string, user: User, isDriver: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Ctx>({
  user: null,
  token: null,
  isDriver: false,
  signIn: async () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isDriver, setIsDriver] = useState<boolean>(false);

  // Sign in for this session only (no AsyncStorage persistence)
  const signIn = async (t: string, u: User, driver: boolean) => {
    try {
      setToken(t);
      setUser(u);
      setIsDriver(driver);

      // Sync to axios/http client for this runtime session
      setApiToken(t);
      console.log("🔐 Session token set (no persistence).");
    } catch (err) {
      console.error("signIn error:", err);
    }
  };

  // Sign out: clear runtime state and axios token
  const signOut = async () => {
    setToken(null);
    setUser(null);
    setIsDriver(false);
    setApiToken(null);
    console.log("🚪 Signed out (session cleared).");
  };

  return (
    <AuthContext.Provider value={{ user, token, isDriver, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
