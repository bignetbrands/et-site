"use client";
import OraclePage from "@/components/OraclePage";

export default function VerdictPage() {
  return (
    <OraclePage config={{
      badge: "👽 ET'S TOKEN TRIBUNAL",
      title: "ET'S VERDICT",
      subtitle: "i've seen enough of earth's tokens to have opinions.\npaste a contract address and i'll give you my honest alien read.\nnot financial advice. just an alien's instincts.",
      verifyEndpoint: "/api/verdict/verify",
      resultKey: "verdict",
      resultLabel: "THE VERDICT",
      resultIcon: "⚖️",
      inputBefore: {
        label: "TOKEN CONTRACT ADDRESS",
        placeholder: "Solana CA (e.g. A1NZ4...xRMF)",
        key: "tokenCA",
        validate: (val) => {
          if (!val.trim()) return "paste a contract address";
          if (val.trim().length < 32 || val.trim().length > 44) return "that doesn't look like a valid Solana CA";
          return null;
        },
      },
    }} />
  );
}
