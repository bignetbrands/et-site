"use client";
import { useState, useEffect, useRef, useCallback } from "react";

interface Suggestion {
  id: string;
  text: string;
  originalText: string;
  status: string;
  votes: number;
  submittedAt: string;
  submittedBy: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type GateState = "loading" | "disconnected" | "connecting" | "checking" | "holder" | "not_holder" | "error";

// ============================================================
// WALLET UTILS
// ============================================================

function getProvider(): { name: string; provider: any } | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (w.phantom?.solana?.isPhantom) return { name: "Phantom", provider: w.phantom.solana };
  if (w.solflare?.isSolflare) return { name: "Solflare", provider: w.solflare };
  if (w.solana?.isPhantom) return { name: "Phantom", provider: w.solana };
  if (w.backpack?.isBackpack) return { name: "Backpack", provider: w.backpack };
  return null;
}

async function checkTokenBalance(walletAddress: string): Promise<{ holder: boolean; balance: number }> {
  const res = await fetch("/api/backroom/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: walletAddress }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Verification failed");
  }

  return { holder: data.holder, balance: data.balance };
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function BackroomPage() {
  // Gate state
  const [gateState, setGateState] = useState<GateState>("loading");
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [walletName, setWalletName] = useState<string>("");
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState("");

  // Chat state — load from localStorage if available
  const DEFAULT_MSG = { text: "you found the backroom. this is where the community talks to me directly. you can chat, or if you've got ideas for how to make $ET better — drop them here. i'll process them into the suggestion board for everyone to vote on. what's on your mind?", who: "et" as const };

  const [messages, setMessages] = useState<Array<{ text: string; who: "et" | "user" }>>(() => {
    if (typeof window === "undefined") return [DEFAULT_MSG];
    try {
      const saved = localStorage.getItem("et_backroom_messages");
      if (saved) { const parsed = JSON.parse(saved); if (parsed.length > 0) return parsed; }
    } catch { /* ignore */ }
    return [DEFAULT_MSG];
  });
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("et_backroom_history");
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return [];
  });

  // Persist chat on every change
  useEffect(() => {
    try { localStorage.setItem("et_backroom_messages", JSON.stringify(messages)); } catch { /* ignore */ }
  }, [messages]);
  useEffect(() => {
    try { localStorage.setItem("et_backroom_history", JSON.stringify(chatHistory)); } catch { /* ignore */ }
  }, [chatHistory]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Load suggestions
  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/backroom/suggestions");
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadSuggestions();
    const interval = setInterval(loadSuggestions, 30000);
    return () => clearInterval(interval);
  }, [loadSuggestions]);

  // ============================================================
  // WALLET CONNECTION
  // ============================================================

  // Auto-reconnect on page load if wallet was previously connected
  useEffect(() => {
    const tryAutoConnect = async () => {
      // If user explicitly disconnected, don't auto-reconnect
      if (localStorage.getItem("et_backroom_disconnected")) {
        setGateState("disconnected");
        return;
      }

      // Check sessionStorage for cached verification
      const cached = sessionStorage.getItem("et_backroom_verified");
      if (cached) {
        try {
          const data = JSON.parse(cached);
          if (data.holder && data.wallet && Date.now() - data.ts < 3600000) { // 1hr TTL
            setWalletAddress(data.wallet);
            setTokenBalance(data.balance || 0);
            setGateState("holder");
            return;
          }
        } catch { /* invalid cache, continue */ }
      }

      // Try silent reconnect (Phantom supports onlyIfTrusted)
      const detected = getProvider();
      if (!detected) {
        setGateState("disconnected");
        return;
      }

      try {
        const resp = await detected.provider.connect({ onlyIfTrusted: true });
        const pubkey = resp.publicKey?.toString() || detected.provider.publicKey?.toString();
        if (!pubkey) {
          setGateState("disconnected");
          return;
        }

        setWalletAddress(pubkey);
        setWalletName(detected.name);
        setGateState("checking");

        const result = await checkTokenBalance(pubkey);
        setTokenBalance(result.balance);

        if (result.holder) {
          setGateState("holder");
          sessionStorage.setItem("et_backroom_verified", JSON.stringify({
            holder: true, wallet: pubkey, balance: result.balance, ts: Date.now(),
          }));
        } else {
          setGateState("not_holder");
        }
      } catch {
        // Silent reconnect failed — user needs to manually connect
        setGateState("disconnected");
      }
    };

    tryAutoConnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connectWallet = async () => {
    const detected = getProvider();
    if (!detected) {
      setErrorMsg("No Solana wallet detected. Install Phantom, Solflare, or Backpack to continue.");
      return;
    }

    setGateState("connecting");
    setWalletName(detected.name);
    setErrorMsg("");
    localStorage.removeItem("et_backroom_disconnected");

    try {
      const resp = await detected.provider.connect();
      const pubkey = resp.publicKey?.toString() || detected.provider.publicKey?.toString();

      if (!pubkey) {
        setGateState("error");
        setErrorMsg("Wallet connected but no public key returned. Try again.");
        return;
      }

      setWalletAddress(pubkey);
      setGateState("checking");

      // Check $ET balance via server-side API
      const result = await checkTokenBalance(pubkey);
      setTokenBalance(result.balance);

      if (result.holder) {
        setGateState("holder");
        // Cache verified state for seamless revisits
        sessionStorage.setItem("et_backroom_verified", JSON.stringify({
          holder: true, wallet: pubkey, balance: result.balance, ts: Date.now(),
        }));
      } else {
        setGateState("not_holder");
      }
    } catch (err: any) {
      if (err?.code === 4001 || err?.message?.includes("rejected")) {
        setGateState("disconnected");
        setErrorMsg("Connection cancelled. Click connect when you're ready.");
      } else {
        setGateState("error");
        setErrorMsg(err?.message || "Connection failed. Please try again.");
        console.error("[Backroom] Wallet error:", err);
      }
    }
  };

  const disconnect = () => {
    const detected = getProvider();
    if (detected?.provider?.disconnect) {
      try { detected.provider.disconnect(); } catch { /* ignore */ }
    }
    sessionStorage.removeItem("et_backroom_verified");
    localStorage.setItem("et_backroom_disconnected", "1");
    localStorage.removeItem("et_backroom_messages");
    localStorage.removeItem("et_backroom_history");
    setGateState("disconnected");
    setWalletAddress("");
    setTokenBalance(0);
    setErrorMsg("");
    setMessages([DEFAULT_MSG]);
    setChatHistory([]);
  };

  const clearChat = () => {
    localStorage.removeItem("et_backroom_messages");
    localStorage.removeItem("et_backroom_history");
    setMessages([DEFAULT_MSG]);
    setChatHistory([]);
  };

  // ============================================================
  // CHAT
  // ============================================================

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");

    setMessages(prev => [...prev, { text, who: "user" }]);
    const newHistory: ChatMessage[] = [...chatHistory, { role: "user", content: text }];
    setChatHistory(newHistory);
    setMessages(prev => [...prev, { text: "...", who: "et" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newHistory, mode: "backroom" }),
      });
      const data = await res.json();
      const reply = data.reply || "ET's signal dropped. try again.";
      setMessages(prev => [...prev.slice(0, -1), { text: reply, who: "et" }]);
      setChatHistory(prev => [...prev, { role: "assistant", content: reply }]);

      if (data.suggestion) {
        try {
          await fetch("/api/backroom/suggestions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "submit",
              text,
              processedText: data.suggestion,
              submittedBy: walletAddress ? walletAddress.slice(0, 8) + "..." : "anon",
            }),
          });
          loadSuggestions();
        } catch { /* ignore */ }
      }
    } catch {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { text: "something went wrong with ET's transmitter. earth tech, am i right?", who: "et" },
      ]);
    }
    setSending(false);
  };

  const vote = async (id: string) => {
    try {
      const res = await fetch("/api/backroom/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "vote", id }),
      });
      const data = await res.json();
      if (data.success) {
        setSuggestions(prev =>
          prev.map(s => s.id === id ? { ...s, votes: data.votes } : s)
            .sort((a, b) => b.votes - a.votes)
        );
      }
    } catch { /* ignore */ }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "implemented": return "#39ff14";
      case "acknowledged": return "#ffaa00";
      case "rejected": return "#ff3c3c";
      default: return "#5a8a52";
    }
  };

  // ============================================================
  // RENDER: GATE (not authenticated)
  // ============================================================

  if (gateState === "loading") {
    return (
      <div style={styles.page}>
        <div style={styles.scanlines} />
        <div style={styles.gateWrap}>
          <div style={styles.gateBox}>
            <div style={styles.gateIcon}>👽</div>
            <div style={styles.gateTitle}>THE BACKROOM</div>
            <div style={styles.gateStatus}>
              <div style={styles.gateSpinner} />
              initializing...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gateState !== "holder") {
    return (
      <div style={styles.page}>
        <div style={styles.scanlines} />
        <div style={styles.gateWrap}>
          <div style={styles.gateBox}>
            <div style={styles.gateIcon}>👽</div>
            <div style={styles.gateTitle}>THE BACKROOM</div>
            <div style={styles.gateSub}>
              token-gated access — $ET holders only
            </div>

            <div style={styles.gateDivider} />

            {gateState === "disconnected" && (
              <>
                <div style={styles.gateDesc}>
                  connect your Solana wallet to verify you hold <span style={{ color: "#39ff14" }}>$ET</span> tokens. this grants access to chat with ET directly and vote on community suggestions.
                </div>
                <button onClick={connectWallet} style={styles.gateBtn}>
                  CONNECT WALLET
                </button>
              </>
            )}

            {gateState === "connecting" && (
              <div style={styles.gateStatus}>
                <div style={styles.gateSpinner} />
                connecting to {walletName}...
              </div>
            )}

            {gateState === "checking" && (
              <div style={styles.gateStatus}>
                <div style={styles.gateSpinner} />
                verifying $ET holdings...
              </div>
            )}

            {gateState === "not_holder" && (
              <>
                <div style={styles.gateWarn}>
                  wallet connected but no $ET tokens found.
                </div>
                <div style={{ ...styles.gateDesc, marginTop: "12px" }}>
                  you need to hold <span style={{ color: "#39ff14" }}>$ET</span> to access the backroom. this is where the community shapes the project.
                </div>
                <div style={styles.gateActions}>
                  <a
                    href="https://trade.padre.gg/trade/solana/A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF"
                    target="_blank"
                    style={styles.gateBtn}
                  >
                    GET $ET
                  </a>
                  <button onClick={disconnect} style={styles.gateBtnGhost}>
                    DISCONNECT
                  </button>
                </div>
                <div style={styles.gateWalletInfo}>
                  connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </div>
              </>
            )}

            {gateState === "error" && (
              <>
                <div style={styles.gateWarn}>{errorMsg}</div>
                <button onClick={() => { setGateState("disconnected"); setErrorMsg(""); }} style={styles.gateBtnGhost}>
                  TRY AGAIN
                </button>
              </>
            )}

            {errorMsg && gateState === "disconnected" && (
              <div style={{ ...styles.gateWarn, marginTop: "12px" }}>{errorMsg}</div>
            )}

            <div style={styles.gateDivider} />

            {/* Security notice */}
            <div style={styles.gateNotice}>
              <div style={styles.gateNoticeTitle}>🔒 how this works</div>
              <div style={styles.gateNoticeText}>
                connecting your wallet is <span style={{ color: "#39ff14" }}>read-only</span>. we only check your public address to verify you hold $ET tokens. this site will never:
              </div>
              <ul style={styles.gateNoticeList}>
                <li><span style={{ color: "#ff3c3c" }}>✕</span> request permission to move, transfer, or spend your tokens</li>
                <li><span style={{ color: "#ff3c3c" }}>✕</span> ask you to sign any transaction</li>
                <li><span style={{ color: "#ff3c3c" }}>✕</span> access your private keys or seed phrase</li>
                <li><span style={{ color: "#ff3c3c" }}>✕</span> store your wallet data on our servers</li>
              </ul>
              <div style={styles.gateNoticeText}>
                your wallet address is only used client-side to query the Solana blockchain for your $ET balance. no data leaves your browser.
              </div>
            </div>

            <a href="/" style={styles.gateBack}>← back to site</a>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: AUTHENTICATED (holder)
  // ============================================================

  return (
    <div style={styles.page}>
      <div style={styles.scanlines} />

      {/* Header */}
      <div style={styles.header}>
        <a href="/" style={styles.backLink}>← back to site</a>
        <div style={styles.headerTitle}>THE BACKROOM</div>
        <div style={styles.headerRight}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={styles.suggestionsToggle}
          >
            {sidebarOpen ? "✕ close" : `◈ suggestions (${suggestions.length})`}
          </button>
          <button onClick={disconnect} style={styles.disconnectBtn} title="Disconnect wallet">
            {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)} ✕
          </button>
        </div>
      </div>

      <div style={styles.layout}>
        {/* CHAT PANEL */}
        <div style={styles.chatPanel}>
          <div style={styles.chatHeader}>
            <div style={styles.avatar}>👽</div>
            <div style={{ flex: 1 }}>
              <div style={styles.chatName}>$ET</div>
              <div style={styles.chatStatus}>online · stranded on earth · listening</div>
            </div>
            {messages.length > 1 && (
              <button onClick={clearChat} style={styles.clearBtn} title="Clear chat history">
                clear chat
              </button>
            )}
          </div>

          <div style={styles.chatMessages}>
            {messages.map((msg, i) => (
              <div key={i} style={msg.who === "et" ? styles.msgEt : styles.msgUser}>
                {msg.text === "..." ? (
                  <span style={{ color: "#5a8a52", fontStyle: "italic" }}>thinking...</span>
                ) : msg.text}
              </div>
            ))}
            <div ref={messagesEnd} />
          </div>

          <div style={styles.inputWrap}>
            <input
              style={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="chat with ET or suggest something..."
              maxLength={500}
              disabled={sending}
            />
            <button
              style={{ ...styles.sendBtn, opacity: sending ? 0.3 : 1 }}
              onClick={sendMessage}
              disabled={sending}
            >
              SEND
            </button>
          </div>

          <div style={styles.chatHint}>
            tip: tell ET your ideas for $ET — he&apos;ll add them to the suggestion board for the community to vote on
          </div>
        </div>

        {/* SUGGESTIONS SIDEBAR */}
        <div style={{
          ...styles.sidebar,
          ...(sidebarOpen ? styles.sidebarOpen : {}),
        }}>
          <div style={styles.sidebarTitle}>◈ COMMUNITY SUGGESTIONS</div>
          <div style={styles.sidebarSub}>
            chat with ET and share your ideas — he&apos;ll process them into voteable items
          </div>

          {suggestions.length === 0 ? (
            <div style={styles.empty}>
              no suggestions yet — be the first to tell ET what you think
            </div>
          ) : (
            <div style={styles.suggestionsList}>
              {suggestions.map(s => (
                <div key={s.id} style={styles.suggestionCard}>
                  <div style={styles.suggestionTop}>
                    <div style={styles.suggestionText}>{s.text}</div>
                    <button
                      onClick={() => vote(s.id)}
                      style={styles.voteBtn}
                      title="Vote for this suggestion"
                    >
                      ▲ {s.votes}
                    </button>
                  </div>
                  <div style={styles.suggestionMeta}>
                    <span style={{ color: statusColor(s.status), textTransform: "uppercase" as const, fontWeight: 700 }}>
                      {s.status}
                    </span>
                    <span>{new Date(s.submittedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: "#010501",
    color: "#c8f7c0",
    fontFamily: "'Space Mono', monospace",
    minHeight: "100vh",
    position: "relative",
  },
  scanlines: {
    position: "fixed",
    top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 999,
    pointerEvents: "none",
    background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.015) 2px, rgba(0,255,0,0.015) 4px)",
  },

  // GATE
  gateWrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  },
  gateBox: {
    width: "100%",
    maxWidth: "440px",
    textAlign: "center" as const,
  },
  gateIcon: {
    fontSize: "48px",
    marginBottom: "16px",
    filter: "drop-shadow(0 0 20px rgba(57,255,20,0.3))",
  },
  gateTitle: {
    fontFamily: "'Silkscreen', cursive",
    fontSize: "22px",
    color: "#39ff14",
    letterSpacing: "6px",
    textShadow: "0 0 20px rgba(57,255,20,0.4)",
    marginBottom: "8px",
  },
  gateSub: {
    fontSize: "10px",
    color: "#5a8a52",
    letterSpacing: "3px",
    textTransform: "uppercase" as const,
  },
  gateDivider: {
    height: "1px",
    background: "#1a3a1a",
    margin: "20px 0",
  },
  gateDesc: {
    fontSize: "11px",
    color: "#8ab882",
    lineHeight: "1.8",
    padding: "0 12px",
  },
  gateBtn: {
    display: "inline-block",
    marginTop: "20px",
    padding: "14px 36px",
    background: "rgba(57,255,20,0.08)",
    border: "1px solid #39ff14",
    color: "#39ff14",
    fontFamily: "'Silkscreen', cursive",
    fontSize: "12px",
    letterSpacing: "3px",
    cursor: "pointer",
    transition: "all 0.3s",
    textDecoration: "none",
    textTransform: "uppercase" as const,
  },
  gateBtnGhost: {
    display: "inline-block",
    marginTop: "12px",
    padding: "10px 24px",
    background: "transparent",
    border: "1px solid #1a3a1a",
    color: "#5a8a52",
    fontFamily: "'Space Mono', monospace",
    fontSize: "10px",
    letterSpacing: "2px",
    cursor: "pointer",
    textTransform: "uppercase" as const,
  },
  gateActions: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
    marginTop: "8px",
  },
  gateStatus: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    fontSize: "11px",
    color: "#5a8a52",
    letterSpacing: "1px",
    padding: "20px 0",
  },
  gateSpinner: {
    width: "14px",
    height: "14px",
    border: "2px solid #1a3a1a",
    borderTop: "2px solid #39ff14",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  gateWarn: {
    fontSize: "11px",
    color: "#ffaa00",
    padding: "12px 16px",
    background: "rgba(255,170,0,0.06)",
    border: "1px solid rgba(255,170,0,0.2)",
    lineHeight: "1.6",
  },
  gateWalletInfo: {
    marginTop: "12px",
    fontSize: "9px",
    color: "#3a5a32",
    letterSpacing: "1px",
  },
  gateNotice: {
    textAlign: "left" as const,
    padding: "16px",
    background: "rgba(10,21,10,0.5)",
    border: "1px solid #1a3a1a",
  },
  gateNoticeTitle: {
    fontFamily: "'Silkscreen', cursive",
    fontSize: "10px",
    color: "#39ff14",
    letterSpacing: "2px",
    marginBottom: "10px",
    textShadow: "0 0 6px rgba(57,255,20,0.3)",
  },
  gateNoticeText: {
    fontSize: "10px",
    color: "#8ab882",
    lineHeight: "1.7",
    letterSpacing: "0.3px",
  },
  gateNoticeList: {
    margin: "8px 0 8px 16px",
    padding: 0,
    fontSize: "9px",
    color: "#5a8a52",
    lineHeight: "1.9",
    letterSpacing: "0.5px",
    listStyle: "none",
  },
  gateBack: {
    display: "inline-block",
    marginTop: "20px",
    color: "#3a5a32",
    textDecoration: "none",
    fontSize: "10px",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
    fontFamily: "'Space Mono', monospace",
  },

  // HEADER
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 20px",
    borderBottom: "1px solid #1a3a1a",
    background: "rgba(3,10,3,0.95)",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  backLink: {
    color: "#5a8a52",
    textDecoration: "none",
    fontSize: "10px",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
    fontFamily: "'Space Mono', monospace",
  },
  headerTitle: {
    fontFamily: "'Silkscreen', cursive",
    fontSize: "14px",
    color: "#39ff14",
    letterSpacing: "4px",
    textShadow: "0 0 12px rgba(57,255,20,0.4)",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  suggestionsToggle: {
    background: "rgba(57,255,20,0.06)",
    border: "1px solid #1a3a1a",
    color: "#39ff14",
    fontFamily: "'Space Mono', monospace",
    fontSize: "9px",
    letterSpacing: "2px",
    padding: "6px 12px",
    cursor: "pointer",
    textTransform: "uppercase" as const,
  },
  disconnectBtn: {
    background: "transparent",
    border: "1px solid #1a3a1a",
    color: "#5a8a52",
    fontFamily: "'Space Mono', monospace",
    fontSize: "9px",
    letterSpacing: "1px",
    padding: "6px 10px",
    cursor: "pointer",
  },
  clearBtn: {
    background: "transparent",
    border: "1px solid #1a3a1a",
    color: "#5a8a52",
    fontFamily: "'Space Mono', monospace",
    fontSize: "8px",
    letterSpacing: "1px",
    padding: "4px 8px",
    cursor: "pointer",
    textTransform: "uppercase" as const,
    flexShrink: 0,
  },

  // LAYOUT
  layout: {
    display: "flex",
    height: "calc(100vh - 49px)",
    position: "relative",
  },
  chatPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 20px",
    borderBottom: "1px solid #1a3a1a",
    flexShrink: 0,
  },
  avatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "1px solid #0a3d00",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    background: "rgba(57,255,20,0.05)",
  },
  chatName: {
    fontFamily: "'Silkscreen', cursive",
    fontSize: "13px",
    color: "#39ff14",
    letterSpacing: "2px",
    textShadow: "0 0 8px rgba(57,255,20,0.4)",
  },
  chatStatus: {
    fontSize: "9px",
    color: "#5a8a52",
    letterSpacing: "1px",
  },
  chatMessages: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  msgEt: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    padding: "10px 14px",
    fontSize: "12px",
    lineHeight: "1.6",
    background: "rgba(57,255,20,0.06)",
    border: "1px solid #1a3a1a",
    color: "#c8f7c0",
    borderRadius: "0 12px 12px 12px",
  },
  msgUser: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    padding: "10px 14px",
    fontSize: "12px",
    lineHeight: "1.6",
    background: "rgba(57,255,20,0.12)",
    border: "1px solid #0a3d00",
    color: "#39ff14",
    borderRadius: "12px 0 12px 12px",
  },
  inputWrap: {
    display: "flex",
    gap: "8px",
    padding: "12px 20px",
    borderTop: "1px solid #1a3a1a",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    background: "rgba(2,8,2,0.8)",
    border: "1px solid #1a3a1a",
    color: "#39ff14",
    fontFamily: "'Space Mono', monospace",
    fontSize: "11px",
    outline: "none",
  },
  sendBtn: {
    padding: "10px 18px",
    background: "rgba(57,255,20,0.08)",
    border: "1px solid #39ff14",
    color: "#39ff14",
    fontFamily: "'Silkscreen', cursive",
    fontSize: "10px",
    letterSpacing: "2px",
    cursor: "pointer",
    flexShrink: 0,
  },
  chatHint: {
    padding: "8px 20px 12px",
    fontSize: "9px",
    color: "#3a5a32",
    letterSpacing: "1px",
    textAlign: "center",
  },

  // SIDEBAR
  sidebar: {
    width: "340px",
    background: "rgba(3,10,3,0.96)",
    borderLeft: "1px solid #1a3a1a",
    padding: "20px",
    overflowY: "auto",
    flexShrink: 0,
    transition: "all 0.3s",
  },
  sidebarOpen: {},
  sidebarTitle: {
    fontFamily: "'Silkscreen', cursive",
    fontSize: "11px",
    color: "#39ff14",
    letterSpacing: "3px",
    textShadow: "0 0 8px rgba(57,255,20,0.4)",
    marginBottom: "8px",
  },
  sidebarSub: {
    fontSize: "9px",
    color: "#5a8a52",
    letterSpacing: "1px",
    lineHeight: "1.7",
    marginBottom: "16px",
    paddingBottom: "12px",
    borderBottom: "1px solid #1a3a1a",
  },
  empty: {
    fontSize: "10px",
    color: "#3a5a32",
    fontStyle: "italic",
    padding: "20px 0",
    textAlign: "center",
  },
  suggestionsList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  suggestionCard: {
    background: "rgba(10,21,10,0.6)",
    border: "1px solid #1a3a1a",
    padding: "12px",
    transition: "border-color 0.2s",
  },
  suggestionTop: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
  },
  suggestionText: {
    flex: 1,
    fontSize: "11px",
    lineHeight: "1.6",
    color: "#c8f7c0",
  },
  voteBtn: {
    background: "rgba(57,255,20,0.06)",
    border: "1px solid #1a3a1a",
    color: "#39ff14",
    fontFamily: "'Space Mono', monospace",
    fontSize: "10px",
    padding: "4px 8px",
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  suggestionMeta: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "8px",
    fontSize: "8px",
    letterSpacing: "1px",
    color: "#5a8a52",
  },
};
