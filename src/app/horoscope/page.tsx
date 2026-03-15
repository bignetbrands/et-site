"use client";
import OraclePage from "@/components/OraclePage";

export default function HoroscopePage() {
  return (
    <OraclePage config={{
      badge: "👽 ET'S COSMIC OBSERVATORY",
      title: "COSMIC HOROSCOPE",
      subtitle: "the stars aren't the only thing i read.\ni also read your on-chain activity.\nyour wallet tells me more about you than any constellation.\npay 0.001 SOL for your weekly transmission from the cosmos.",
      verifyEndpoint: "/api/horoscope/verify",
      resultKey: "horoscope",
      resultLabel: "YOUR WEEKLY TRANSMISSION",
      resultIcon: "✨",
    }} />
  );
}
