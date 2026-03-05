import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "$ET — Rewards Extra Terrestrial Research",
  description:
    "An alien lost on Earth. Trying to phone home. Using your internet, your science, and your blockchain. OG on Solana.",
  openGraph: {
    title: "$ET — Rewards Extra Terrestrial Research",
    description:
      "An alien lost on Earth. Trying to phone home. $ET on Solana.",
    images: ["/ET_BANNER_12.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "$ET — Rewards Extra Terrestrial Research",
    description:
      "An alien lost on Earth. Trying to phone home. $ET on Solana.",
    images: ["/ET_BANNER_12.png"],
    creator: "@etalienx",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Archivo+Black&family=Orbitron:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#050508" }}>
        {children}
      </body>
    </html>
  );
}
