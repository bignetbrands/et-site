import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quantum Oracle — $ET",
  description: "ET's quantum signal generator. Pay 0.1 SOL, receive a verified random number from the cosmos.",
  other: {
    "dapp-url": "https://etsearch.fun/rng",
  },
};

export default function RNGLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="manifest" href="/solana-dapp-manifest.json" />
      {children}
    </>
  );
}
