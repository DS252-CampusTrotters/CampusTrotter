//admin-portal/src/components/DemandTick.tsx
import React from "react";

export default function DemandTick({ high }: { high?: boolean }) {
  if (high) return <span role="img" aria-label="High demand" title="High demand">✅</span>;
  return <span role="img" aria-label="Low demand" title="Low demand">❌</span>;
}
