"use client";
import OraclePage from "@/components/OraclePage";

export default function SignalPage() {
  return (
    <OraclePage config={{
      badge: "👽 ET'S BEHAVIORAL ANALYSIS UNIT",
      title: "SIGNAL INTERPRETER",
      subtitle: "your on-chain activity tells a story.\ni've been reading human behavioral patterns for years.\npaste any Solana wallet and i'll tell you what the data says about the creature behind it.",
      verifyEndpoint: "/api/signal/verify",
      resultKey: "interpretation",
      resultLabel: "BEHAVIORAL ANALYSIS",
      resultIcon: "📡",
      inputBefore: {
        label: "WALLET ADDRESS TO ANALYZE",
        placeholder: "Solana wallet address (leave blank to analyze your own)",
        key: "targetWallet",
        validate: (val) => {
          if (!val.trim()) return null; // blank = use own wallet
          if (val.trim().length < 32 || val.trim().length > 44) return "that doesn't look like a valid Solana address";
          return null;
        },
      },
    }} />
  );
}
