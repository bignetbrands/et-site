// @ts-nocheck
"use client";
import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = "idle" | "connecting" | "input" | "building" | "signing" | "verifying" | "result" | "error";

export interface OraclePageConfig {
  badge: string;
  title: string;
  subtitle: string;
  cost?: string;
  // Input field shown BEFORE payment (optional)
  inputBefore?: {
    label: string;
    placeholder: string;
    key: string; // key name sent to verify API
    validate?: (val: string) => string | null; // return error string or null
  };
  verifyEndpoint: string; // e.g. "/api/fortune/verify"
  resultKey: string; // key in verify response e.g. "fortune"
  resultLabel: string; // e.g. "THE SIGNAL READS"
  resultIcon?: string; // emoji shown with result
}

// ─── Wallet utils ─────────────────────────────────────────────────────────────

function getProvider(): { name: string; provider: any } | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (w.phantom?.solana?.isPhantom) return { name: "Phantom", provider: w.phantom.solana };
  if (w.solflare?.isSolflare)       return { name: "Solflare", provider: w.solflare };
  if (w.solana?.isPhantom)          return { name: "Phantom",  provider: w.solana };
  if (w.backpack?.isBackpack)        return { name: "Backpack", provider: w.backpack };
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OraclePage({ config }: { config: OraclePageConfig }) {
  const cost = config.cost || "0.001";
  const [stage, setStage]       = useState<Stage>("idle");
  const [wallet, setWallet]     = useState("");
  const [walletName, setWalletName] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [inputErr, setInputErr] = useState("");
  const [result, setResult]     = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [dots, setDots]         = useState(".");
  const [scanLine, setScanLine] = useState(0);

  useEffect(() => {
    const loading = ["building","signing","verifying","connecting"].includes(stage);
    if (!loading) return;
    const t = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 400);
    return () => clearInterval(t);
  }, [stage]);

  useEffect(() => {
    const t = setInterval(() => setScanLine(n => (n + 1) % 100), 30);
    return () => clearInterval(t);
  }, []);

  async function connect() {
    setStage("connecting");
    setErrorMsg("");
    const detected = getProvider();
    if (!detected) {
      setErrorMsg("no wallet detected. install Phantom, Solflare, or Backpack.");
      setStage("error"); return;
    }
    try {
      const resp = await detected.provider.connect();
      setWallet(resp.publicKey.toString());
      setWalletName(detected.name);
      setStage(config.inputBefore ? "input" : "idle");
      // If no input needed, go straight to idle-connected state
      if (!config.inputBefore) setStage("idle");
    } catch {
      setErrorMsg("wallet connection rejected.");
      setStage("error");
    }
  }

  function disconnect() {
    setWallet(""); setWalletName(""); setResult(""); setInputVal("");
    setStage("idle"); setErrorMsg(""); setInputErr("");
  }

  async function pay() {
    if (!wallet) return;
    // Validate input if required
    if (config.inputBefore) {
      const err = config.inputBefore.validate ? config.inputBefore.validate(inputVal) : null;
      if (err) { setInputErr(err); return; }
      if (!inputVal.trim()) { setInputErr("required"); return; }
    }
    setErrorMsg(""); setInputErr("");

    try {
      // 1. Build invoice
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

      // 2. Sign
      setStage("signing");
      const detected = getProvider();
      if (!detected) throw new Error("wallet disconnected. please reconnect.");

      const { Transaction } = await import("@solana/web3.js");
      const tx = Transaction.from(Buffer.from(txBase64, "base64"));

      let sig: string;

      if (detected.provider.signAndSendTransaction) {
        try {
          const result = await detected.provider.signAndSendTransaction(tx);
          sig = typeof result === "string" ? result : result.signature;
        } catch (err: any) {
          const msg = err?.message || "";
          if (err?.code === 4001 || msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")) {
            throw new Error("transaction rejected by wallet.");
          }
          if (msg.toLowerCase().includes("insufficient")) {
            throw new Error(`insufficient SOL balance. you need at least ${cost} SOL plus fees.`);
          }
          throw new Error(msg || "transaction failed.");
        }
        await new Promise(r => setTimeout(r, 3000));
      } else {
        let signedTx;
        try { signedTx = await detected.provider.signTransaction(tx); }
        catch { throw new Error("transaction rejected by wallet."); }
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://rpc.solanatracker.io/public";
        const { Connection } = await import("@solana/web3.js");
        const connection = new Connection(rpcUrl, "confirmed");
        sig = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false, preflightCommitment: "confirmed",
        }).catch((err: any) => {
          const logs: string[] = err?.logs ?? [];
          if (logs.join(" ").toLowerCase().includes("insufficient")) {
            throw new Error(`insufficient SOL balance. you need at least ${cost} SOL plus fees.`);
          }
          throw new Error((err?.message || "transaction failed").replace("Transaction simulation failed: ", "").split(". Logs:")[0]);
        });
        const bh = await connection.getLatestBlockhash("confirmed");
        await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      }

      // 3. Verify + get result
      setStage("verifying");
      const body: Record<string, string> = { wallet, memo, startTime, endTime, amount };
      if (config.inputBefore) body[config.inputBefore.key] = inputVal.trim();

      const verifyRes = await fetch(config.verifyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!verifyRes.ok) {
        const d = await verifyRes.json();
        throw new Error(d.error || "verification failed");
      }
      const data = await verifyRes.json();
      setResult(data[config.resultKey] || "no signal received");
      setStage("result");

    } catch (err: any) {
      setErrorMsg(err?.message || "something went wrong. try again.");
      setStage("error");
    }
  }

  function reset() { setResult(""); setErrorMsg(""); setStage(wallet ? "idle" : "idle"); }

  const stageLabel: Partial<Record<Stage, string>> = {
    connecting: `connecting${dots}`,
    building:   `building transaction${dots}`,
    signing:    `waiting for signature${dots}`,
    verifying:  `reading the signal${dots}`,
  };

  const isConnected = !!wallet;
  const showPayBtn = isConnected && (stage === "idle" || stage === "input");

  return (
    <div style={s.root}>
      <div style={{ ...s.scanLine, top: `${scanLine}%` }} />
      <div style={s.grid} />
      <a href="/oracle" style={s.back}>← back to oracle</a>

      <div style={s.card}>
        <div style={s.header}>
          <div style={s.badge}>{config.badge}</div>
          <h1 style={s.title}>{config.title}</h1>
          <p style={s.subtitle}>{config.subtitle}</p>
        </div>

        <div style={s.divider} />

        {/* Idle — not connected */}
        {stage === "idle" && !isConnected && (
          <div style={s.section}>
            <p style={s.hint}>connect your Solana wallet to begin</p>
            <button style={s.btnPrimary} onClick={connect}>CONNECT WALLET</button>
            <p style={s.costNote}>{cost} SOL · one reading</p>
          </div>
        )}

        {/* Connecting */}
        {stage === "connecting" && (
          <div style={s.section}>
            <p style={s.loadingText}>{stageLabel.connecting}</p>
          </div>
        )}

        {/* Connected — no input required */}
        {stage === "idle" && isConnected && !config.inputBefore && (
          <div style={s.section}>
            <div style={s.walletRow}>
              <span style={s.walletChip}>✓ {walletName} · {wallet.slice(0,4)}…{wallet.slice(-4)}</span>
              <button style={s.btnGhost} onClick={disconnect}>disconnect</button>
            </div>
            <button style={s.btnPrimary} onClick={pay}>CONSULT THE ORACLE</button>
            <p style={s.costNote}>{cost} SOL · one reading</p>
          </div>
        )}

        {/* Input stage */}
        {(stage === "input" || (stage === "idle" && isConnected && config.inputBefore)) && (
          <div style={s.section}>
            <div style={s.walletRow}>
              <span style={s.walletChip}>✓ {walletName} · {wallet.slice(0,4)}…{wallet.slice(-4)}</span>
              <button style={s.btnGhost} onClick={disconnect}>disconnect</button>
            </div>
            <div style={s.inputWrap}>
              <label style={s.inputLabel}>{config.inputBefore!.label}</label>
              <input
                style={{ ...s.inputField, ...(inputErr ? s.inputError : {}) }}
                placeholder={config.inputBefore!.placeholder}
                value={inputVal}
                onChange={e => { setInputVal(e.target.value); setInputErr(""); }}
              />
              {inputErr && <p style={s.inputErrText}>{inputErr}</p>}
            </div>
            <button style={s.btnPrimary} onClick={pay}>CONSULT THE ORACLE</button>
            <p style={s.costNote}>{cost} SOL · one reading</p>
          </div>
        )}

        {/* Loading states */}
        {["building","signing","verifying"].includes(stage) && (
          <div style={s.section}>
            <div style={s.terminalBox}>
              <p style={s.terminalLine}>
                <span style={s.terminalPrompt}>&gt;</span> {stageLabel[stage as Stage]}
              </p>
              {stage === "signing" && (
                <p style={s.terminalHint}>approve the transaction in your wallet</p>
              )}
              {stage === "verifying" && (
                <p style={s.terminalHint}>ET is consulting the signal array...</p>
              )}
            </div>
          </div>
        )}

        {/* Result */}
        {stage === "result" && result && (
          <div style={s.section}>
            <div style={s.resultBox}>
              <p style={s.resultLabel}>{config.resultLabel}</p>
              {config.resultIcon && <p style={s.resultIcon}>{config.resultIcon}</p>}
              <p style={s.resultText}>{result}</p>
            </div>
            <div style={s.actionRow}>
              <button style={s.btnPrimary} onClick={() => { reset(); }}>CONSULT AGAIN</button>
              <button style={s.btnGhost} onClick={disconnect}>disconnect</button>
            </div>
          </div>
        )}

        {/* Error */}
        {stage === "error" && (
          <div style={s.section}>
            <div style={s.errorBox}>
              <p style={s.errorLabel}>SIGNAL LOST</p>
              <p style={s.errorMsg}>{errorMsg}</p>
            </div>
            <button style={s.btnPrimary} onClick={() => { setStage(wallet ? "idle" : "idle"); setErrorMsg(""); }}>
              {wallet ? "TRY AGAIN" : "RECONNECT"}
            </button>
          </div>
        )}

        <div style={s.footer}>
          <span style={s.footerText}>
            powered by pump.fun · verified on Solana · 0.001 SOL per reading
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
  root: {
    minHeight: "100vh", background: "#050508",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "'DM Mono', monospace",
    position: "relative", overflow: "hidden",
  },
  scanLine: {
    position: "fixed", left: 0, right: 0, height: "2px",
    background: "rgba(0,255,100,0.04)", pointerEvents: "none", zIndex: 0,
    transition: "top 0.03s linear",
  },
  grid: {
    position: "fixed", inset: 0,
    backgroundImage: "linear-gradient(rgba(0,255,100,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,100,0.03) 1px, transparent 1px)",
    backgroundSize: "40px 40px", pointerEvents: "none", zIndex: 0,
  },
  back: {
    position: "fixed", top: 20, left: 20,
    color: DIM_GREEN, fontSize: 12,
    fontFamily: "'DM Mono', monospace",
    textDecoration: "none", letterSpacing: "0.05em", zIndex: 10, opacity: 0.7,
  },
  card: {
    position: "relative", zIndex: 1,
    width: "100%", maxWidth: 540,
    background: "rgba(5,5,8,0.92)",
    border: `1px solid ${BORDER}`, borderRadius: 4,
    padding: "40px 36px",
    boxShadow: "0 0 60px rgba(0,255,100,0.06), inset 0 0 40px rgba(0,255,100,0.02)",
  },
  header: { textAlign: "center" as const, marginBottom: 28 },
  badge: {
    display: "inline-block", fontSize: 10, letterSpacing: "0.2em",
    color: DIM_GREEN, border: `1px solid ${BORDER}`,
    padding: "4px 12px", borderRadius: 2, marginBottom: 16,
    fontFamily: "'Orbitron', sans-serif",
  },
  title: {
    fontFamily: "'Orbitron', sans-serif", fontSize: 26, fontWeight: 800,
    color: "#fff", letterSpacing: "0.1em", margin: "0 0 12px",
  },
  subtitle: { color: "rgba(255,255,255,0.45)", fontSize: 13, lineHeight: 1.7, margin: 0 },
  divider: { height: 1, background: BORDER, margin: "28px 0" },
  section: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 16 },
  hint: { color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0, letterSpacing: "0.03em" },
  btnPrimary: {
    width: "100%", padding: "16px 24px",
    background: GREEN, color: "#000", border: "none", borderRadius: 3,
    fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700,
    letterSpacing: "0.15em", cursor: "pointer",
  },
  btnGhost: {
    background: "transparent", border: `1px solid ${BORDER}`,
    color: DIM_GREEN, padding: "8px 16px", borderRadius: 3,
    fontFamily: "'DM Mono', monospace", fontSize: 12,
    letterSpacing: "0.05em", cursor: "pointer",
  },
  costNote: { color: "rgba(255,255,255,0.25)", fontSize: 11, margin: 0, letterSpacing: "0.08em" },
  walletRow: {
    display: "flex", alignItems: "center", gap: 10,
    flexWrap: "wrap" as const, justifyContent: "center",
  },
  walletChip: {
    background: FAINT_GREEN, border: `1px solid ${BORDER}`,
    color: GREEN, fontSize: 11, padding: "6px 12px", borderRadius: 2, letterSpacing: "0.05em",
  },
  loadingText: { color: DIM_GREEN, fontSize: 13, letterSpacing: "0.08em", margin: 0 },
  inputWrap: { width: "100%", display: "flex", flexDirection: "column" as const, gap: 6 },
  inputLabel: { color: DIM_GREEN, fontSize: 11, letterSpacing: "0.1em" },
  inputField: {
    width: "100%", padding: "12px 14px",
    background: "rgba(0,0,0,0.4)", border: `1px solid ${BORDER}`,
    borderRadius: 3, color: "#fff",
    fontFamily: "'DM Mono', monospace", fontSize: 13,
    outline: "none", boxSizing: "border-box" as const,
  },
  inputError: { borderColor: "rgba(255,50,50,0.5)" },
  inputErrText: { color: "rgba(255,80,80,0.8)", fontSize: 11, margin: 0 },
  terminalBox: {
    width: "100%", background: "rgba(0,0,0,0.4)",
    border: `1px solid ${BORDER}`, borderRadius: 3, padding: "20px 24px", textAlign: "left" as const,
  },
  terminalLine: { color: GREEN, fontSize: 13, margin: 0, letterSpacing: "0.05em" },
  terminalPrompt: { color: DIM_GREEN, marginRight: 8 },
  terminalHint: { color: "rgba(255,255,255,0.3)", fontSize: 11, margin: "8px 0 0", letterSpacing: "0.04em" },
  resultBox: {
    width: "100%", background: FAINT_GREEN,
    border: "1px solid rgba(0,255,100,0.2)", borderRadius: 3, padding: "28px 24px",
    textAlign: "center" as const,
  },
  resultLabel: {
    color: DIM_GREEN, fontSize: 10, letterSpacing: "0.25em",
    fontFamily: "'Orbitron', sans-serif", margin: "0 0 12px",
  },
  resultIcon: { fontSize: 32, margin: "0 0 12px" },
  resultText: {
    color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 1.8,
    margin: 0, fontStyle: "italic",
  },
  actionRow: { display: "flex", flexDirection: "column" as const, gap: 10, width: "100%", alignItems: "center" },
  errorBox: {
    width: "100%", background: "rgba(255,50,50,0.06)",
    border: "1px solid rgba(255,50,50,0.2)", borderRadius: 3, padding: "20px 24px", textAlign: "center" as const,
  },
  errorLabel: { color: "#ff4444", fontSize: 10, letterSpacing: "0.25em", fontFamily: "'Orbitron', sans-serif", margin: "0 0 8px" },
  errorMsg: { color: "rgba(255,255,255,0.45)", fontSize: 13, margin: 0 },
  footer: { marginTop: 28, paddingTop: 20, borderTop: `1px solid ${BORDER}`, textAlign: "center" as const },
  footerText: { color: "rgba(255,255,255,0.15)", fontSize: 10, letterSpacing: "0.05em" },
};
