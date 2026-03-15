"use client";
import OraclePage from "@/components/OraclePage";

export default function TransmissionPage() {
  return (
    <OraclePage config={{
      badge: "👽 ET'S SIGNAL ARRAY",
      title: "TRANSMISSION DECODER",
      subtitle: "i've been picking up human transmissions for years.\nask me anything.\ni'll answer it the way an alien who has watched your species for decades would.\nwhich is to say: honestly, and probably from a weird angle.",
      verifyEndpoint: "/api/transmission/verify",
      resultKey: "transmission",
      resultLabel: "TRANSMISSION RECEIVED",
      resultIcon: "📻",
      inputBefore: {
        label: "YOUR QUESTION",
        placeholder: "ask ET anything...",
        key: "question",
        validate: (val) => {
          if (!val.trim()) return "you have to ask something";
          if (val.trim().length < 3) return "that's not really a question";
          if (val.trim().length > 500) return "too much signal noise — keep it under 500 characters";
          return null;
        },
      },
    }} />
  );
}
