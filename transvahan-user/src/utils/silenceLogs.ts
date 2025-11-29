// src/utils/silenceLogs.ts
// Disables noisy console logs in production builds while keeping errors.
import { LogBox } from "react-native";

let silenced = false;

export function silenceLogsForProd() {
  if (silenced) return;
  silenced = true;

  // Hide RN yellow box warnings
  LogBox.ignoreAllLogs();

  if (__DEV__) return;

  const noop = () => {};
  // Keep console.error intact for critical failures, silence the rest.
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.warn = noop;
}

export default silenceLogsForProd;
