// @ts-nocheck
"use client";
import { useState, useEffect, useRef } from "react";
import Head from "next/head";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage =
  | "idle"        // wallet not connected
  | "connecting"  // user clicked connect
  | "connected"   // wallet connected, ready to pay
  | "building"    // fetching invoice from server
  | "signing"     // waiting for wallet signature
  | "verifying"   // polling server for on-chain confirmation
  | "result"      // number revealed
  | "error";      // something went wrong

// ─── Wallet utils (matches existing backroom pattern) ─────────────────────────

function getProvider(): { name: string; provider: any } | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (w.phantom?.solana?.isPhantom) return { name: "Phantom", provider: w.phantom.solana };
  if (w.solflare?.isSolflare)       return { name: "Solflare", provider: w.solflare };
  if (w.solana?.isPhantom)          return { name: "Phantom",  provider: w.solana };
  if (w.backpack?.isBackpack)        return { name: "Backpack", provider: w.backpack };
  return null;
}

// ─── Glitch text animation ────────────────────────────────────────────────────

const GLITCH_CHARS = "!<>-_\\/[]{}—=+*^?#01";
function useGlitch(target: string, running: boolean) {
  const [display, setDisplay] = useState(target);
  const frame = useRef<ReturnType<typeof setTimeout>>();
  const iter = useRef(0);

  useEffect(() => {
    if (!running) { setDisplay(target); return; }
    iter.current = 0;
    const interval = setInterval(() => {
      setDisplay(
        target
          .split("")
          .map((ch, i) =>
            i < iter.current
              ? target[i]
              : GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
          )
          .join("")
      );
      if (iter.current >= target.length) clearInterval(interval);
      iter.current += 1 / 3;
    }, 30);
    return () => clearInterval(interval);
  }, [target, running]);

  return display;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RNGPage() {
  const [stage, setStage]           = useState<Stage>("idle");
  const [wallet, setWallet]         = useState("");
  const [walletName, setWalletName] = useState("");
  const [result, setResult]         = useState<number | null>(null);
  const [errorMsg, setErrorMsg]     = useState("");
  const [dots, setDots]             = useState(".");
  const [scanLine, setScanLine]     = useState(0);

  // Glitch the result number
  const resultStr = result !== null ? String(result) : "???";
  const glitchedResult = useGlitch(resultStr, stage === "result");

  // Animated dots for loading states
  useEffect(() => {
    const loading = ["building", "signing", "verifying", "connecting"].includes(stage);
    if (!loading) return;
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "." : d + ".")), 400);
    return () => clearInterval(t);
  }, [stage]);

  // Scan line animation
  useEffect(() => {
    const t = setInterval(() => setScanLine((n) => (n + 1) % 100), 30);
    return () => clearInterval(t);
  }, []);

  // ─── Wallet connect ──────────────────────────────────────────────────────────

  async function connect() {
    setStage("connecting");
    setErrorMsg("");
    const detected = getProvider();
    if (!detected) {
      setErrorMsg("no wallet detected. install Phantom, Solflare, or Backpack.");
      setStage("error");
      return;
    }
    try {
      const resp = await detected.provider.connect();
      const address = resp.publicKey.toString();
      setWallet(address);
      setWalletName(detected.name);
      setStage("connected");
    } catch (err: any) {
      // Phantom may block unregistered dApps — suggest alternatives
      const msg = err?.message || "";
      if (msg.toLowerCase().includes("block") || msg.toLowerCase().includes("malicious") || err?.code === 4001) {
        setErrorMsg("phantom blocked this request. try Solflare or Backpack instead — same wallet, no restrictions.");
      } else {
        setErrorMsg("wallet connection rejected.");
      }
      setStage("error");
    }
  }

  function disconnect() {
    setWallet("");
    setWalletName("");
    setResult(null);
    setStage("idle");
    setErrorMsg("");
  }

  // ─── Payment flow ────────────────────────────────────────────────────────────

  async function pay() {
    if (!wallet) return;
    setErrorMsg("");

    try {
      // 1. Get invoice + unsigned tx from server
      setStage("building");
      const invoiceRes = await fetch("/api/rng/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      if (!invoiceRes.ok) {
        const d = await invoiceRes.json();
        throw new Error(d.error || "failed to build invoice");
      }
      const { txBase64, memo, startTime, endTime, amount } = await invoiceRes.json();

      // 2. Deserialize and sign with wallet
      setStage("signing");
      const detected = getProvider();
      if (!detected) throw new Error("wallet disconnected. please reconnect.");

      // Dynamically import @solana/web3.js buffer utils (client-side only)
      const { Transaction } = await import("@solana/web3.js");
      const txBytes = Buffer.from(txBase64, "base64");
      const tx = Transaction.from(txBytes);

      let signedTx;
      try {
        signedTx = await detected.provider.signTransaction(tx);
      } catch {
        throw new Error("transaction rejected by wallet.");
      }

      // 3. Send raw transaction via Helius RPC
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://rpc.solanatracker.io/public";
      const { Connection } = await import("@solana/web3.js");
      const connection = new Connection(rpcUrl, "confirmed");

      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");

      // 4. Server verifies payment and returns number
      setStage("verifying");
      const verifyRes = await fetch("/api/rng/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, memo, startTime, endTime, amount }),
      });
      if (!verifyRes.ok) {
        const d = await verifyRes.json();
        throw new Error(d.error || "payment verification failed");
      }
      const { result: num } = await verifyRes.json();
      setResult(num);
      setStage("result");

    } catch (err: any) {
      setErrorMsg(err?.message || "something went wrong. try again.");
      setStage("error");
    }
  }

  function reset() {
    setResult(null);
    setErrorMsg("");
    setStage("connected");
  }

  // ─── Stage labels ─────────────────────────────────────────────────────────

  const stageLabel: Record<Stage, string> = {
    idle:       "",
    connecting: `connecting${dots}`,
    connected:  "",
    building:   `building transaction${dots}`,
    signing:    `waiting for signature${dots}`,
    verifying:  `verifying on-chain${dots}`,
    result:     "",
    error:      "",
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={s.root}>
      {/* Scan line overlay */}
      <div style={{ ...s.scanLine, top: `${scanLine}%` }} />

      {/* Grid bg */}
      <div style={s.grid} />

      {/* Back link */}
      <a href="/" style={s.back}>← back to base</a>

      <div style={s.card}>
        {/* Phantom warning */}
        <div style={s.phantomWarn}>
          <span style={s.phantomWarnIcon}>⚠️</span>
          <span>
            Phantom may block this page while we await dApp verification.{" "}
            <strong>Solflare</strong> or <strong>Backpack</strong> work without restrictions.
          </span>
        </div>

        {/* Header */}
        <div style={s.header}>
          <div style={s.badge}>👽 ET&apos;S QUANTUM ORACLE</div>
          <h1 style={s.title}>SIGNAL GENERATOR</h1>
          <p style={s.subtitle}>
            i don&apos;t trust earth&apos;s random number generators.<br />
            so i built my own. costs 0.1 SOL to operate the antenna.<br />
            the number comes from the signal, not the algorithm.
          </p>
        </div>

        {/* Divider */}
        <div style={s.divider} />

        {/* State machine UI */}
        {stage === "idle" && (
          <div style={s.section}>
            <p style={s.hint}>connect your Solana wallet to begin</p>
            <button style={s.btnPrimary} onClick={connect}>
              CONNECT WALLET
            </button>
            <p style={s.costNote}>0.1 SOL · one signal · 0–1000</p>
          </div>
        )}

        {stage === "connecting" && (
          <div style={s.section}>
            <p style={s.loadingText}>{stageLabel.connecting}</p>
          </div>
        )}

        {stage === "connected" && (
          <div style={s.section}>
            <div style={s.walletRow}>
              <span style={s.walletChip}>
                ✓ {walletName} · {wallet.slice(0, 4)}…{wallet.slice(-4)}
              </span>
              <button style={s.btnGhost} onClick={disconnect}>disconnect</button>
            </div>
            <button style={s.btnPrimary} onClick={pay}>
              GENERATE NUMBER
            </button>
            <p style={s.costNote}>0.1 SOL · one signal · 0–1000</p>
          </div>
        )}

        {["building", "signing", "verifying"].includes(stage) && (
          <div style={s.section}>
            <div style={s.terminalBox}>
              <p style={s.terminalLine}>
                <span style={s.terminalPrompt}>&gt;</span> {stageLabel[stage]}
              </p>
              {stage === "signing" && (
                <p style={s.terminalHint}>approve the transaction in your wallet</p>
              )}
            </div>
          </div>
        )}

        {stage === "result" && result !== null && (
          <div style={s.section}>
            <div style={s.resultBox}>
              <p style={s.resultLabel}>THE SIGNAL READS</p>
              <div style={s.resultNumber}>{glitchedResult}</div>
              <p style={s.resultSub}>
                {result === 0 && "zero. the void spoke. listen carefully."}
                {result === 1000 && "one thousand. the signal is strong today."}
                {result > 0 && result < 1000 && `verified on-chain. this number is yours.`}
              </p>
            </div>
            <div style={s.actionRow}>
              <button style={s.btnPrimary} onClick={reset}>
                GENERATE AGAIN
              </button>
              <button style={s.btnGhost} onClick={disconnect}>disconnect</button>
            </div>
          </div>
        )}

        {stage === "error" && (
          <div style={s.section}>
            <div style={s.errorBox}>
              <p style={s.errorLabel}>SIGNAL LOST</p>
              <p style={s.errorMsg}>{errorMsg}</p>
            </div>
            <div style={s.actionRow}>
              <button
                style={s.btnPrimary}
                onClick={wallet ? reset : connect}
              >
                {wallet ? "TRY AGAIN" : "RECONNECT"}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={s.footer}>
          <span style={s.footerText}>
            powered by pump.fun · verified on Solana · $ET CA: A1NZ4kjhJxdmMMHQTGF8HaU7k6JCch5gSyHEeAKE3xRMF
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GREEN = "#00ff64";
const DIM_GREEN = "rgba(0,255,100,0.55)";
const FAINT_GREEN = "rgba(0,255,100,0.08)";
const BORDER = "rgba(0,255,100,0.15)";

const s: Record<string, React.CSSProperties> = {
  phantomWarn: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    background: "rgba(255,180,0,0.07)",
    border: "1px solid rgba(255,180,0,0.2)",
    borderRadius: 3,
    padding: "12px 16px",
    marginBottom: 24,
    fontSize: 12,
    color: "rgba(255,220,100,0.8)",
    lineHeight: 1.6,
  },
  phantomWarnIcon: {
    flexShrink: 0,
    marginTop: 1,
  },
  root: {
    minHeight: "100vh",
    background: "#050508",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "'DM Mono', monospace",
    position: "relative",
    overflow: "hidden",
  },
  scanLine: {
    position: "fixed",
    left: 0,
    right: 0,
    height: "2px",
    background: "rgba(0,255,100,0.04)",
    pointerEvents: "none",
    zIndex: 0,
    transition: "top 0.03s linear",
  },
  grid: {
    position: "fixed",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(0,255,100,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,100,0.03) 1px, transparent 1px)",
    backgroundSize: "40px 40px",
    pointerEvents: "none",
    zIndex: 0,
  },
  back: {
    position: "fixed",
    top: 20,
    left: 20,
    color: DIM_GREEN,
    fontSize: 12,
    fontFamily: "'DM Mono', monospace",
    textDecoration: "none",
    letterSpacing: "0.05em",
    zIndex: 10,
    opacity: 0.7,
  },
  card: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 520,
    background: "rgba(5,5,8,0.92)",
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    padding: "40px 36px",
    boxShadow: `0 0 60px rgba(0,255,100,0.06), inset 0 0 40px rgba(0,255,100,0.02)`,
  },
  header: {
    textAlign: "center" as const,
    marginBottom: 28,
  },
  badge: {
    display: "inline-block",
    fontSize: 10,
    letterSpacing: "0.2em",
    color: DIM_GREEN,
    border: `1px solid ${BORDER}`,
    padding: "4px 12px",
    borderRadius: 2,
    marginBottom: 16,
    fontFamily: "'Orbitron', sans-serif",
  },
  title: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 28,
    fontWeight: 800,
    color: "#fff",
    letterSpacing: "0.1em",
    margin: "0 0 12px",
  },
  subtitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    lineHeight: 1.7,
    margin: 0,
  },
  divider: {
    height: 1,
    background: BORDER,
    margin: "28px 0",
  },
  section: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 16,
  },
  hint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    margin: 0,
    letterSpacing: "0.03em",
  },
  btnPrimary: {
    width: "100%",
    padding: "16px 24px",
    background: GREEN,
    color: "#000",
    border: "none",
    borderRadius: 3,
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.15em",
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  btnGhost: {
    background: "transparent",
    border: `1px solid ${BORDER}`,
    color: DIM_GREEN,
    padding: "8px 16px",
    borderRadius: 3,
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    letterSpacing: "0.05em",
    cursor: "pointer",
  },
  costNote: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 11,
    margin: 0,
    letterSpacing: "0.08em",
  },
  walletRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  walletChip: {
    background: FAINT_GREEN,
    border: `1px solid ${BORDER}`,
    color: GREEN,
    fontSize: 11,
    padding: "6px 12px",
    borderRadius: 2,
    letterSpacing: "0.05em",
  },
  loadingText: {
    color: DIM_GREEN,
    fontSize: 13,
    letterSpacing: "0.08em",
    margin: 0,
  },
  terminalBox: {
    width: "100%",
    background: "rgba(0,0,0,0.4)",
    border: `1px solid ${BORDER}`,
    borderRadius: 3,
    padding: "20px 24px",
    textAlign: "left" as const,
  },
  terminalLine: {
    color: GREEN,
    fontSize: 13,
    margin: 0,
    letterSpacing: "0.05em",
  },
  terminalPrompt: {
    color: DIM_GREEN,
    marginRight: 8,
  },
  terminalHint: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 11,
    margin: "8px 0 0",
    letterSpacing: "0.04em",
  },
  resultBox: {
    width: "100%",
    background: FAINT_GREEN,
    border: `1px solid rgba(0,255,100,0.25)`,
    borderRadius: 3,
    padding: "32px 24px",
    textAlign: "center" as const,
  },
  resultLabel: {
    color: DIM_GREEN,
    fontSize: 10,
    letterSpacing: "0.25em",
    fontFamily: "'Orbitron', sans-serif",
    margin: "0 0 12px",
  },
  resultNumber: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 72,
    fontWeight: 900,
    color: GREEN,
    lineHeight: 1,
    margin: "0 0 16px",
    textShadow: `0 0 30px rgba(0,255,100,0.5)`,
    letterSpacing: "0.05em",
  },
  resultSub: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    margin: 0,
    letterSpacing: "0.05em",
  },
  actionRow: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
    width: "100%",
    alignItems: "center",
  },
  errorBox: {
    width: "100%",
    background: "rgba(255,50,50,0.06)",
    border: "1px solid rgba(255,50,50,0.2)",
    borderRadius: 3,
    padding: "20px 24px",
    textAlign: "center" as const,
  },
  errorLabel: {
    color: "#ff4444",
    fontSize: 10,
    letterSpacing: "0.25em",
    fontFamily: "'Orbitron', sans-serif",
    margin: "0 0 8px",
  },
  errorMsg: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    margin: 0,
    letterSpacing: "0.03em",
  },
  footer: {
    marginTop: 28,
    paddingTop: 20,
    borderTop: `1px solid ${BORDER}`,
    textAlign: "center" as const,
  },
  footerText: {
    color: "rgba(255,255,255,0.15)",
    fontSize: 10,
    letterSpacing: "0.05em",
    wordBreak: "break-all" as const,
  },
};
