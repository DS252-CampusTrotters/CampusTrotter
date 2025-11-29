// admin-portal/src/components/DemandLegend.tsx
import React from "react";

export default function DemandLegend() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <span>Demand:</span>
      <span>✅ High</span>
      <span>❌ Low</span>
    </div>
  );
}
