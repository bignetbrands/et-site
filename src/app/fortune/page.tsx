"use client";
import OraclePage from "@/components/OraclePage";

export default function FortunePage() {
  return (
    <OraclePage config={{
      badge: "👽 ET'S COSMIC SIGNAL ARRAY",
      title: "FORTUNE TELLER",
      subtitle: "i've been watching your planet for a while.\ni've noticed some patterns.\npay 0.001 SOL and i'll tell you what the signal says about what's coming.",
      verifyEndpoint: "/api/fortune/verify",
      resultKey: "fortune",
      resultLabel: "THE SIGNAL SAYS",
      resultIcon: "🔮",
    }} />
  );
}
