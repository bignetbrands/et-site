// @ts-nocheck
"use client";
import { useState, useEffect } from "react";

const FEATURES = [
  {
    href: "/rng",
    icon: "🎲",
    title: "QUANTUM ORACLE",
    subtitle: "Random Number Generator",
    description: "i don't trust earth's random number generators. so i built my own. the number comes from the signal, not the algorithm.",
    cost: "0.001 SOL",
    tag: "0 – 1000",
  },
  {
    href: "/fortune",
    icon: "🔮",
    title: "FORTUNE TELLER",
    subtitle: "Cosmic Prediction",
    description: "i've been watching your planet for a while. i've noticed some patterns. ask me what's coming.",
    cost: "0.001 SOL",
    tag: "1 reading",
  },
  {
    href: "/signal",
    icon: "📡",
    title: "SIGNAL INTERPRETER",
    subtitle: "Wallet Behavior Analysis",
    description: "your on-chain activity tells a story. i've been reading human behavioral patterns for years. paste a wallet and i'll tell you what the data says about the creature behind it.",
    cost: "0.001 SOL",
    tag: "any wallet",
  },
  {
    href: "/verdict",
    icon: "⚖️",
    title: "ET'S VERDICT",
    subtitle: "Token Analysis",
    description: "i've seen enough of earth's tokens to have opinions. paste a CA and i'll give you my honest alien read. not financial advice. just instincts.",
    cost: "0.001 SOL",
    tag: "any token",
  },
  {
    href: "/transmission",
    icon: "📻",
    title: "TRANSMISSION DECODER",
    subtitle: "Ask ET Anything",
    description: "ask me anything. i'll answer it the way an alien who has watched your species for decades would. honestly, and probably from a weird angle.",
    cost: "0.001 SOL",
    tag: "1 question",
  },
  {
    href: "/horoscope",
    icon: "✨",
    title: "COSMIC HOROSCOPE",
    subtitle: "Weekly Transmission",
    description: "the stars aren't the only thing i read. i also read your on-chain activity. your wallet tells me more about you than any constellation.",
    cost: "0.001 SOL",
    tag: "weekly read",
  },
];

export default function OracleHubPage() {
  const [scanLine, setScanLine] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setScanLine(n => (n + 1) % 100), 30);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={s.root}>
      <div style={{ ...s.scanLine, top: `${scanLine}%` }} />
      <div style={s.grid} />
      <a href="/" style={s.back}>← back to base</a>

      <div style={s.inner}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.badge}>👽 ET'S ORACLE NETWORK</div>
          <h1 style={s.title}>THE SIGNAL ARRAY</h1>
          <p style={s.subtitle}>
            i've been stranded on this planet long enough to develop some useful skills.<br />
            each of these costs 0.001 SOL. revenue flows back to the $ET token.<br />
            you fund the search. i do the reading.
          </p>
        </div>

        <div style={s.divider} />

        {/* Feature grid */}
        <div style={s.grid2}>
          {FEATURES.map((f, i) => (
            <a
              key={i}
              href={f.href}
              style={{
                ...s.card,
                ...(hovered === i ? s.cardHovered : {}),
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div style={s.cardTop}>
                <span style={s.cardIcon}>{f.icon}</span>
                <div style={s.cardTags}>
                  <span style={s.cardTag}>{f.cost}</span>
                  <span style={s.cardTag}>{f.tag}</span>
                </div>
              </div>
              <div style={s.cardTitleRow}>
                <p style={s.cardTitle}>{f.title}</p>
                <p style={s.cardSubtitle}>{f.subtitle}</p>
              </div>
              <p style={s.cardDesc}>{f.description}</p>
              <div style={s.cardCta}>
                <span style={{ ...s.ctaText, ...(hovered === i ? s.ctaTextHovered : {}) }}>
                  consult →
                </span>
              </div>
            </a>
          ))}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <p style={s.footerText}>
            all oracle features are powered by pump.fun tokenized agent payments · verified on Solana mainnet
          </p>
          <p style={s.footerText}>
            $ET CA: A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF
          </p>
        </div>
      </div>
    </div>
  );
}

const GREEN = "#00ff64";
const DIM_GREEN = "rgba(0,255,100,0.55)";
const FAINT_GREEN = "rgba(0,255,100,0.06)";
const BORDER = "rgba(0,255,100,0.15)";

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh", background: "#050508",
    fontFamily: "'DM Mono', monospace",
    position: "relative", overflowX: "hidden",
    padding: "80px 24px 60px",
  },
  scanLine: {
    position: "fixed", left: 0, right: 0, height: "2px",
    background: "rgba(0,255,100,0.03)", pointerEvents: "none", zIndex: 0,
    transition: "top 0.03s linear",
  },
  grid: {
    position: "fixed", inset: 0,
    backgroundImage: "linear-gradient(rgba(0,255,100,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,100,0.025) 1px, transparent 1px)",
    backgroundSize: "40px 40px", pointerEvents: "none", zIndex: 0,
  },
  back: {
    position: "fixed", top: 20, left: 20,
    color: DIM_GREEN, fontSize: 12,
    fontFamily: "'DM Mono', monospace",
    textDecoration: "none", letterSpacing: "0.05em", zIndex: 10, opacity: 0.7,
  },
  inner: {
    position: "relative", zIndex: 1,
    maxWidth: 1100, margin: "0 auto",
  },
  header: { textAlign: "center" as const, marginBottom: 40 },
  badge: {
    display: "inline-block", fontSize: 10, letterSpacing: "0.2em",
    color: DIM_GREEN, border: `1px solid ${BORDER}`,
    padding: "4px 14px", borderRadius: 2, marginBottom: 20,
    fontFamily: "'Orbitron', sans-serif",
  },
  title: {
    fontFamily: "'Orbitron', sans-serif", fontSize: 42, fontWeight: 900,
    color: "#fff", letterSpacing: "0.1em", margin: "0 0 16px",
  },
  subtitle: {
    color: "rgba(255,255,255,0.4)", fontSize: 14, lineHeight: 1.8,
    margin: "0 auto", maxWidth: 560,
  },
  divider: { height: 1, background: BORDER, margin: "40px 0" },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 16,
  },
  card: {
    background: "rgba(5,5,10,0.8)",
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    padding: "28px 24px",
    textDecoration: "none",
    display: "flex", flexDirection: "column" as const, gap: 12,
    transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
    cursor: "pointer",
  },
  cardHovered: {
    borderColor: "rgba(0,255,100,0.4)",
    background: "rgba(0,255,100,0.04)",
    boxShadow: "0 0 30px rgba(0,255,100,0.06)",
  },
  cardTop: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  },
  cardIcon: { fontSize: 28 },
  cardTags: { display: "flex", gap: 6, flexWrap: "wrap" as const, justifyContent: "flex-end" },
  cardTag: {
    fontSize: 10, letterSpacing: "0.08em",
    color: DIM_GREEN, border: `1px solid ${BORDER}`,
    padding: "2px 8px", borderRadius: 2,
  },
  cardTitleRow: { display: "flex", flexDirection: "column" as const, gap: 2 },
  cardTitle: {
    fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700,
    color: "#fff", letterSpacing: "0.1em", margin: 0,
  },
  cardSubtitle: {
    fontSize: 11, color: DIM_GREEN, margin: 0, letterSpacing: "0.05em",
  },
  cardDesc: {
    color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 1.7,
    margin: 0, flexGrow: 1,
  },
  cardCta: { marginTop: 4 },
  ctaText: {
    fontSize: 12, color: "rgba(0,255,100,0.4)",
    letterSpacing: "0.08em", transition: "color 0.2s",
  },
  ctaTextHovered: { color: GREEN },
  footer: { marginTop: 60, textAlign: "center" as const },
  footerText: {
    color: "rgba(255,255,255,0.12)", fontSize: 10,
    letterSpacing: "0.05em", margin: "4px 0",
    wordBreak: "break-all" as const,
  },
};
