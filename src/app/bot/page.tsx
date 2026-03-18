"use client";

import { useState, useEffect, useCallback } from "react";

// ============================================================
// ET BOT — Mission Control Dashboard
// ============================================================

const PILLARS = [
  { id: "human_observation", name: "Human Observation", icon: "👁️", desc: "Alien perspective on human behavior" },
  { id: "research_drop", name: "Research Drop", icon: "📡", desc: "SETI, Einstein@home, space science" },
  { id: "crypto_community", name: "Crypto / Community", icon: "⚡", desc: "$ET updates, degen culture, BOINC" },
  { id: "personal_lore", name: "Personal Lore", icon: "🌑", desc: "Memories, the crash, parents" },
  { id: "existential", name: "Existential", icon: "🌌", desc: "Big questions, loneliness, meaning" },
  { id: "disclosure_conspiracy", name: "Disclosure", icon: "🛸", desc: "UAP hearings, fun conspiracies" },
  { id: "gm", name: "GM", icon: "☀️", desc: "Morning dream painting — every 3 days at 5AM EST" },
  { id: "gn", name: "GN", icon: "🌙", desc: "Night dream painting — every 3 days at 11PM EST" },
];

export default function BotDashboard() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [killSwitch, setKillSwitch] = useState(false);
  const [loading, setLoading] = useState("");
  const [log, setLog] = useState<Array<{ time: string; msg: string; type: "info" | "success" | "error" | "warn" }>>([]);
  const [preview, setPreview] = useState<{ text: string; pillar: string; imageUrl?: string; charCount: number; selfAwareness?: string } | null>(null);
  const [selectedPillar, setSelectedPillar] = useState("human_observation");
  const [watchlist, setWatchlist] = useState<Array<{ handle: string; addedAt: string; note?: string }>>([]);
  const [vipUsers, setVipUsers] = useState<string[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [threadUrl, setThreadUrl] = useState("");
  const [threadPreview, setThreadPreview] = useState<string[] | null>(null);
  const [replyPreview, setReplyPreview] = useState<{ tweetUrl: string; replyText: string; originalText: string; originalAuthor: string; tweetId: string } | null>(null);
  const [homepageMode, setHomepageMode] = useState<string>("new");
  const [memeResult, setMemeResult] = useState<string | null>(null);
  const [walletInfo, setWalletInfo] = useState<{ configured: boolean; address?: string; balance?: number; message?: string } | null>(null);
  const [rewardsQueue, setRewardsQueue] = useState<any[]>([]);
  const [rewardsLoading, setRewardsLoading] = useState("");
  const [victoryPreview, setVictoryPreview] = useState<Record<string, string>>({});
  const [promptText, setPromptText] = useState("");
  const [promptPreview, setPromptPreview] = useState<string | null>(null);
  const [riddleAnswer, setRiddleAnswer] = useState("");
  const [riddles, setRiddles] = useState<any[]>([]);
  const [riddleWinner, setRiddleWinner] = useState<Record<string, { winner: string; wallet: string; tweetUrl: string }>>({});
  const [newRiddle, setNewRiddle] = useState({ tweetUrl: "", question: "", answer: "" });
  const [checkReplyUrl, setCheckReplyUrl] = useState<Record<string, string>>({});
  const [checkVerdict, setCheckVerdict] = useState<Record<string, any>>({});
  const [showRiddleAnswer, setShowRiddleAnswer] = useState<Record<string, boolean>>({});

  const addLog = useCallback((msg: string, type: "info" | "success" | "error" | "warn" = "info") => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLog((prev) => [{ time, msg, type }, ...prev].slice(0, 50));
  }, []);

  const authHeaders = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

  // Check kill switch status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/kill-switch", { headers: authHeaders });
      if (res.status === 401) { setAuthenticated(false); return; }
      const data = await res.json();
      setKillSwitch(data.killSwitch);
      setAuthenticated(true);
      addLog(`Status: ${data.status}`, data.killSwitch ? "warn" : "info");
    } catch (e) {
      addLog(`Connection failed: ${e}`, "error");
    }
  }, [secret]);

  // Load VIP users
  const loadVipUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/vip", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setVipUsers(data.vipUsers || []);
      }
    } catch (e) { /* silent */ }
  }, [secret]);

  // Load dashboard status
  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const res = await fetch("/api/admin/status", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setDashboard(data);
      }
    } catch (e) { /* silent */ }
    setDashLoading(false);
  }, [secret]);

  // Load rewards queue
  const loadRiddles = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/riddles", { headers: authHeaders });
      if (res.ok) { const data = await res.json(); setRiddles(data.riddles || []); }
    } catch { /* silent */ }
  }, [secret]);

  const loadRewardsQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/rewards", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setRewardsQueue(data.queue || []);
      }
    } catch { /* silent */ }
  }, [secret]);

  // Load ET wallet info
  const loadWalletInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/wallet", { headers: authHeaders });
      if (res.ok) setWalletInfo(await res.json());
    } catch { /* silent */ }
  }, [secret]);

  // Load scheduled tweets
  const loadScheduled = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/scheduled", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setScheduled(data.scheduled || []);
      }
    } catch (e) { /* silent */ }
  }, [secret]);

  // Load homepage mode
  const loadHomepageMode = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/homepage", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setHomepageMode(data.mode || "new");
      }
    } catch (e) { /* silent */ }
  }, [secret]);

  // Toggle kill switch
  const toggleKillSwitch = async () => {
    setLoading("kill");
    try {
      const res = await fetch("/api/admin/kill-switch", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ enabled: !killSwitch }),
      });
      const data = await res.json();
      setKillSwitch(data.killSwitch);
      addLog(data.status, data.killSwitch ? "warn" : "success");
    } catch (e) {
      addLog(`Kill switch error: ${e}`, "error");
    }
    setLoading("");
  };

  // Dry run
  const dryRun = async () => {
    setLoading("dry");
    setPreview(null);
    addLog(`Generating ${selectedPillar} preview...`, "info");
    try {
      const res = await fetch("/api/manual/tweet", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ pillar: selectedPillar, dryRun: true }),
      });
      const data = await res.json();
      if (data.error) { addLog(`Error: ${data.error}`, "error"); setLoading(""); return; }
      setPreview({ text: data.tweet, pillar: data.pillar, imageUrl: data.imageUrl, charCount: data.charCount, selfAwareness: data.selfAwareness });
      addLog(`Preview: "${data.tweet.slice(0, 60)}..." (${data.charCount} chars)`, "success");
    } catch (e) {
      addLog(`Dry run failed: ${e}`, "error");
    }
    setLoading("");
  };

  // Force post
  const forcePost = async () => {
    if (!confirm("Post this tweet to X right now?")) return;
    setLoading("post");
    addLog(`Posting ${selectedPillar} tweet...`, "info");
    try {
      const res = await fetch("/api/manual/tweet", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ pillar: selectedPillar, dryRun: false }),
      });
      const data = await res.json();
      if (data.error) { addLog(`Post failed: ${data.error}`, "error"); return; }
      addLog(`✓ Posted: "${data.tweet.text.slice(0, 60)}..." (ID: ${data.tweet.id})`, "success");
      setPreview(null);
    } catch (e) {
      addLog(`Post failed: ${e}`, "error");
    }
    setLoading("");
  };

  // Login handler
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    checkStatus();
    loadVipUsers();
    loadDashboard();
      loadWalletInfo();
      loadRewardsQueue();
    loadRiddles();
    loadScheduled();
    loadHomepageMode();
  };

  // Auto-refresh dashboard every 60s
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(loadDashboard, 60000);
    return () => clearInterval(interval);
  }, [authenticated, loadDashboard]);

  if (!authenticated) {
    return (
      <div style={styles.page}>
        <div style={styles.loginBox}>
          <pre style={styles.ascii}>{`
    ╔══════════════════════════════╗
    ║                              ║
    ║   ET MISSION CONTROL  👽    ║
    ║                              ║
    ╚══════════════════════════════╝`}</pre>
          <form onSubmit={handleLogin} style={styles.loginForm}>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="ADMIN_SECRET"
              style={styles.input}
              autoFocus
            />
            <button type="submit" style={styles.btnPrimary}>AUTHENTICATE</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.logo}>ET MISSION CONTROL</span>
            <span style={styles.badge}>v1.0</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={async () => {
                setLoading("homepageToggle");
                try {
                  const res = await fetch("/api/admin/homepage", {
                    method: "POST",
                    headers: authHeaders,
                  });
                  const data = await res.json();
                  if (data.mode) {
                    setHomepageMode(data.mode);
                    addLog(`✓ Homepage → ${data.mode === "new" ? "Main" : "Research"}`, "success");
                  }
                } catch (e) { addLog(`Toggle failed: ${e}`, "error"); }
                setLoading("");
              }}
              disabled={loading === "homepageToggle"}
              style={{
                background: homepageMode === "research" ? "rgba(255,200,0,0.1)" : "rgba(0,255,100,0.1)",
                border: `1px solid ${homepageMode === "research" ? "#5a5a1a" : "#1a3a1a"}`,
                color: homepageMode === "research" ? "#ffcc00" : "#39ff14",
                padding: "4px 10px",
                fontFamily: "monospace",
                fontSize: "9px",
                cursor: "pointer",
                borderRadius: "2px",
                letterSpacing: "1px",
              }}
            >
              {loading === "homepageToggle" ? "..." : `HOME: ${homepageMode === "research" ? "RESEARCH" : "MAIN"}`}
            </button>
            <a href="/" style={styles.homeLink}>← back to site</a>
          </div>
        </div>

        {/* Status Bar */}
        <div style={styles.statusBar}>
          <div style={styles.statusItem}>
            <span style={styles.statusDot(killSwitch ? "#ff4444" : "#39ff14")} />
            <span>{killSwitch ? "PAUSED" : "ACTIVE"}</span>
          </div>
          <button
            onClick={toggleKillSwitch}
            disabled={loading === "kill"}
            style={{
              ...styles.btnSmall,
              ...(killSwitch ? styles.btnDanger : styles.btnWarn),
            }}
          >
            {loading === "kill" ? "..." : killSwitch ? "▶ RESUME ET" : "⏸ PAUSE ET"}
          </button>
        </div>

        {/* ET Wallet Treasury */}
        {walletInfo && (
          <div style={{ ...styles.panel, marginBottom: "16px", borderColor: walletInfo.configured && (walletInfo.balance ?? 0) < 0.2 ? "rgba(255,200,0,0.3)" : "rgba(0,255,100,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={styles.panelTitle}>👽 ET TREASURY</div>
              <button onClick={loadWalletInfo} style={{ ...styles.btnSmall, fontSize: "9px", padding: "2px 8px" }}>↻ REFRESH</button>
            </div>
            {walletInfo.configured ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>ADDRESS</span>
                  <span style={{ color: "#00ff64", fontFamily: "monospace", fontSize: "10px" }}>
                    {walletInfo.address?.slice(0,6)}…{walletInfo.address?.slice(-6)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>BALANCE</span>
                  <span style={{ color: (walletInfo.balance ?? 0) < 0.2 ? "#ffcc00" : "#00ff64", fontWeight: 700 }}>
                    {walletInfo.balance?.toFixed(4)} SOL
                    {(walletInfo.balance ?? 0) < 0.2 && " ⚠️ LOW"}
                  </span>
                </div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>
                  Rewards: 0.05–0.1 SOL per winner · auto-sent on wallet address detection
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "11px", color: "rgba(255,200,0,0.7)" }}>
                ⚠️ {walletInfo.message || "ET_WALLET_PRIVATE_KEY not configured"}
              </div>
            )}
          </div>
        )}

        {/* Rewards Queue */}
        <div style={{ ...styles.panel, marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={styles.panelTitle}>🏆 REWARDS QUEUE</div>
            <button onClick={loadRewardsQueue} style={{ ...styles.btnSmall, fontSize: "9px", padding: "2px 8px" }}>↻ REFRESH</button>
          </div>

          {/* Manual add */}
          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,255,100,0.1)", borderRadius: "4px", padding: "10px", marginBottom: "12px" }}>
            <div style={{ fontSize: "9px", color: "rgba(0,255,100,0.5)", letterSpacing: "0.1em", marginBottom: "8px" }}>＋ MANUALLY ADD WINNER</div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px" }}>
              <input id="manualWinner" placeholder="@username" style={{ ...styles.input, fontSize: "11px", padding: "4px 8px" }} />
              <input id="manualWallet" placeholder="Solana wallet address" style={{ ...styles.input, fontSize: "11px", padding: "4px 8px" }} />
              <input id="manualTask" placeholder="Task context (what did they do?)" style={{ ...styles.input, fontSize: "11px", padding: "4px 8px" }} />
              <input id="manualTweetUrl" placeholder="Tweet URL (optional)" style={{ ...styles.input, fontSize: "11px", padding: "4px 8px" }} />
              <input id="manualSolscan" placeholder="Solscan tx URL (optional)" style={{ ...styles.input, fontSize: "11px", padding: "4px 8px" }} />
              <button
                onClick={async () => {
                  const winner = (document.getElementById("manualWinner") as HTMLInputElement)?.value.trim();
                  const wallet = (document.getElementById("manualWallet") as HTMLInputElement)?.value.trim();
                  const task = (document.getElementById("manualTask") as HTMLInputElement)?.value.trim();
                  const tweetUrl = (document.getElementById("manualTweetUrl") as HTMLInputElement)?.value.trim();
                  if (!winner || !wallet) { addLog("Enter winner and wallet address", "warn"); return; }
                  const tweetIdMatch = tweetUrl?.match(/status\/(\d+)/);
                  setRewardsLoading("manualAdd");
                  const res = await fetch("/api/admin/rewards", {
                    method: "POST",
                    headers: { ...authHeaders, "Content-Type": "application/json" },
                    body: JSON.stringify({ id: "manual", action: "manual_add", winner, walletAddress: wallet, taskContext: task || "manually added", walletTweetId: tweetIdMatch?.[1] || "", solscanUrl: (document.getElementById("manualSolscan") as HTMLInputElement)?.value.trim() || "" }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    addLog(`Added @${winner} to rewards queue`, "success");
                    ["manualWinner","manualWallet","manualTask","manualTweetUrl","manualSolscan"].forEach(id => {
                      const el = document.getElementById(id) as HTMLInputElement;
                      if (el) el.value = "";
                    });
                    loadRewardsQueue();
                  } else { addLog(`Error: ${data.error}`, "error"); }
                  setRewardsLoading("");
                }}
                disabled={rewardsLoading === "manualAdd"}
                style={{ ...styles.btnSmall, fontSize: "10px", padding: "4px 10px", background: "rgba(0,255,100,0.08)", borderColor: "rgba(0,255,100,0.2)", color: "#00ff64" }}
              >
                {rewardsLoading === "manualAdd" ? "..." : "＋ ADD TO QUEUE"}
              </button>
            </div>
          </div>

          {rewardsQueue.filter((r: any) => r.status === "pending").length === 0 ? (
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "12px 0" }}>no pending rewards</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {rewardsQueue.filter((r: any) => r.status === "pending").map((item: any) => (
                <div key={item.id} style={{ background: "rgba(0,255,100,0.04)", border: "1px solid rgba(0,255,100,0.12)", borderRadius: "4px", padding: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ color: "#00ff64", fontSize: "12px", fontWeight: 700 }}>@{item.winner}</span>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>{new Date(item.submittedAt).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>
                    <span style={{ color: "rgba(255,255,255,0.3)" }}>TASK: </span>{item.taskContext.substring(0, 120)}...
                  </div>
                  <div style={{ fontSize: "10px", fontFamily: "monospace", color: "rgba(0,255,100,0.6)", marginBottom: "8px" }}>
                    {item.walletAddress.slice(0,8)}…{item.walletAddress.slice(-8)}
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <a href={`https://x.com/${item.winner}/status/${item.walletTweetId}`} target="_blank" rel="noopener noreferrer"
                      style={{ ...styles.btnSmall, fontSize: "9px", padding: "3px 8px", textDecoration: "none", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      VIEW TWEET ↗
                    </a>
                    <button
                      onClick={async () => {
                        setRewardsLoading(item.id + "_reject");
                        const res = await fetch("/api/admin/rewards", {
                          method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
                          body: JSON.stringify({ id: item.id, action: "reject" }),
                        });
                        if (res.ok) { addLog(`Rejected reward for @${item.winner}`, "warn"); loadRewardsQueue(); }
                        setRewardsLoading("");
                      }}
                      disabled={rewardsLoading === item.id + "_reject"}
                      style={{ ...styles.btnSmall, fontSize: "9px", padding: "3px 8px", background: "rgba(255,50,50,0.1)", borderColor: "rgba(255,50,50,0.3)", color: "#ff6666" }}
                    >
                      {rewardsLoading === item.id + "_reject" ? "..." : "✕ REJECT"}
                    </button>
                    <button
                      onClick={async () => {
                        setRewardsLoading(item.id + "_confirm");
                        const res = await fetch("/api/admin/rewards", {
                          method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
                          body: JSON.stringify({ id: item.id, action: "confirm", conversationId: item.conversationId, winner: item.winner, walletAddress: item.walletAddress, walletTweetId: item.walletTweetId, taskContext: item.taskContext }),
                        });
                        const data = await res.json();
                        if (res.ok && data.success) {
                          addLog(`✅ ${data.solAmount} SOL split: ${data.solAmount/2} SOL sent to @${item.winner}, ${data.solAmount/2} SOL swapped to $ET locked 69d (stream: ${data.streamId || "n/a"})`, "success");
                          loadRewardsQueue(); loadWalletInfo();
                        } else {
                          addLog(`❌ Payment failed: ${data.error}`, "error");
                        }
                        setRewardsLoading("");
                      }}
                      disabled={rewardsLoading === item.id + "_confirm"}
                      style={{ ...styles.btnSmall, fontSize: "9px", padding: "3px 8px", background: "rgba(0,255,100,0.12)", borderColor: "rgba(0,255,100,0.3)", color: "#00ff64" }}
                    >
                      {rewardsLoading === item.id + "_confirm" ? "sending..." : "✓ CONFIRM & PAY"}
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Mark @${item.winner} as paid WITHOUT sending SOL? Only use if SOL was already sent manually.`)) return;
                        setRewardsLoading(item.id + "_markpaid");
                        const res = await fetch("/api/admin/rewards", {
                          method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
                          body: JSON.stringify({ id: item.id, action: "mark_paid" }),
                        });
                        if ((await res.json()).success) { addLog(`Marked @${item.winner} as paid`, "warn"); loadRewardsQueue(); }
                        setRewardsLoading("");
                      }}
                      disabled={rewardsLoading === item.id + "_markpaid"}
                      style={{ ...styles.btnSmall, fontSize: "9px", padding: "3px 8px", background: "rgba(255,200,0,0.12)", borderColor: "rgba(255,200,0,0.4)", color: "#ffcc00" }}
                    >
                      {rewardsLoading === item.id + "_markpaid" ? "..." : "MARK PAID"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Winners — SOL already sent */}
          {rewardsQueue.filter((r: any) => r.status === "confirmed").length > 0 && (
            <div style={{ marginTop: "16px", borderTop: "1px solid rgba(0,255,100,0.08)", paddingTop: "12px" }}>
              <div style={{ fontSize: "9px", color: "rgba(0,255,100,0.4)", letterSpacing: "0.1em", marginBottom: "8px" }}>
                WINNERS — SOL SENT
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
                {rewardsQueue.filter((r: any) => r.status === "confirmed").map((item: any) => (
                  <div key={item.id} style={{ background: "rgba(0,255,100,0.02)", border: "1px solid rgba(0,255,100,0.08)", borderRadius: "4px", padding: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ color: "#00ff64", fontSize: "12px", fontWeight: 700 }}>@{item.winner}</span>
                      <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px" }}>{new Date(item.submittedAt).toLocaleDateString()}</span>
                    </div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>
                      {(item.taskContext || "").substring(0, 100)}
                    </div>
                    {/* Solscan URL edit field */}
                    <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                      <input
                        id={`solscan_${item.id}`}
                        defaultValue={item.solscanUrl || ""}
                        placeholder="Solscan tx URL"
                        style={{ ...styles.input, flex: 1, fontSize: "10px", padding: "3px 8px" }}
                      />
                      <button
                        onClick={async () => {
                          const val = (document.getElementById(`solscan_${item.id}`) as HTMLInputElement)?.value.trim();
                          setRewardsLoading(item.id + "_save");
                          const res = await fetch("/api/admin/rewards", {
                            method: "POST",
                            headers: { ...authHeaders, "Content-Type": "application/json" },
                            body: JSON.stringify({ id: item.id, action: "update_item", solscanUrl: val }),
                          });
                          const data = await res.json();
                          if (data.success) { addLog(`Saved Solscan URL for @${item.winner}`, "success"); loadRewardsQueue(); }
                          else { addLog(`Save failed: ${data.error}`, "error"); }
                          setRewardsLoading("");
                        }}
                        disabled={rewardsLoading === item.id + "_save"}
                        style={{ ...styles.btnSmall, fontSize: "9px", padding: "3px 8px", background: "rgba(0,255,100,0.08)", borderColor: "rgba(0,255,100,0.2)", color: "#00ff64" }}
                      >
                        {rewardsLoading === item.id + "_save" ? "..." : "SAVE"}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" as const }}>
                      {item.walletTweetId && (
                        <a href={`https://x.com/${item.winner}/status/${item.walletTweetId}`} target="_blank" rel="noopener noreferrer"
                          style={{ ...styles.btnSmall, fontSize: "9px", padding: "3px 8px", textDecoration: "none", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          VIEW TWEET
                        </a>
                      )}
                      {item.solscanUrl && (
                        <a href={item.solscanUrl} target="_blank" rel="noopener noreferrer"
                          style={{ ...styles.btnSmall, fontSize: "9px", padding: "3px 8px", textDecoration: "none", color: "rgba(100,200,255,0.7)", border: "1px solid rgba(100,200,255,0.15)" }}>
                          SOLSCAN ↗
                        </a>
                      )}
                      {!victoryPreview[item.id] ? (
                        <button
                          onClick={async () => {
                            setRewardsLoading(item.id + "_preview");
                            const res = await fetch("/api/admin/rewards", {
                              method: "POST",
                              headers: { ...authHeaders, "Content-Type": "application/json" },
                              body: JSON.stringify({ id: item.id, action: "victory_tweet_preview", winner: item.winner, taskContext: item.taskContext, walletTweetId: item.walletTweetId, solscanUrl: item.solscanUrl || "", streamId: item.streamId || "" }),
                            });
                            const data = await res.json();
                            if (data.success) setVictoryPreview((p: Record<string,string>) => ({ ...p, [item.id]: data.preview, [item.id + "_2"]: data.preview2 || "" }));
                            else addLog(`Preview failed: ${data.error}`, "error");
                            setRewardsLoading("");
                          }}
                          disabled={rewardsLoading === item.id + "_preview"}
                          style={{ ...styles.btnSmall, fontSize: "9px", padding: "3px 8px", background: "rgba(255,200,0,0.08)", borderColor: "rgba(255,200,0,0.25)", color: "#ffcc00" }}
                        >
                          {rewardsLoading === item.id + "_preview" ? "generating..." : "PREVIEW VICTORY TWEET"}
                        </button>
                      ) : (
                        <div style={{ width: "100%", marginTop: "4px" }}>
                          <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,200,0,0.2)", borderRadius: "3px", padding: "8px 10px", fontSize: "11px", color: "rgba(255,255,255,0.75)", lineHeight: "1.5", marginBottom: "4px", whiteSpace: "pre-wrap" }}>
                            <div style={{ fontSize: "9px", color: "rgba(255,200,0,0.4)", marginBottom: "4px" }}>[1/2]</div>
                            {victoryPreview[item.id]}
                          </div>
                          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,200,0,0.1)", borderRadius: "3px", padding: "8px 10px", fontSize: "11px", color: "rgba(255,255,255,0.45)", lineHeight: "1.5", marginBottom: "6px", whiteSpace: "pre-wrap" }}>
                            <div style={{ fontSize: "9px", color: "rgba(255,200,0,0.25)", marginBottom: "4px" }}>[2/2]</div>
                            {victoryPreview[item.id + "_2"] || "the other half is locked as $et for 69 days. claim at streamflow when lock expires 👽 [2/2]"}
                          </div>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              onClick={() => setVictoryPreview((p: Record<string,string>) => { const n = {...p}; delete n[item.id]; return n; })}
                              style={{ ...styles.btnSmall, fontSize: "9px", padding: "3px 8px", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.1)" }}
                            >
                              ↺ REGENERATE
                            </button>
                            <button
                              onClick={async () => {
                                setRewardsLoading(item.id + "_victory");
                                const res = await fetch("/api/admin/rewards", {
                                  method: "POST",
                                  headers: { ...authHeaders, "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: item.id, action: "victory_tweet", winner: item.winner, taskContext: item.taskContext, walletTweetId: item.walletTweetId, solscanUrl: item.solscanUrl || "", streamId: item.streamId || "" }),
                                });
                                const data = await res.json();
                                if (data.success) {
                                  addLog(`Victory tweet posted for @${item.winner}`, "success");
                                  setVictoryPreview((p: Record<string,string>) => { const n = {...p}; delete n[item.id]; return n; });
                                } else addLog(`Victory tweet failed: ${data.error}`, "error");
                                setRewardsLoading("");
                              }}
                              disabled={rewardsLoading === item.id + "_victory"}
                              style={{ ...styles.btnSmall, fontSize: "9px", padding: "3px 8px", background: "rgba(0,255,100,0.12)", borderColor: "rgba(0,255,100,0.3)", color: "#00ff64" }}
                            >
                              {rewardsLoading === item.id + "_victory" ? "posting..." : "✓ POST TWEET"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dashboard */}
        {dashboard && (
          <div style={{ ...styles.panel, marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={styles.panelTitle}>◈ SYSTEM DASHBOARD</div>
              <button
                onClick={loadDashboard}
                disabled={dashLoading}
                style={{ ...styles.btnSmall, fontSize: "9px", padding: "2px 8px" }}
              >
                {dashLoading ? "..." : "↻ REFRESH"}
              </button>
            </div>

            {/* Blockers */}
            <div style={{ marginBottom: "14px" }}>
              {dashboard.blockers.map((b: string, i: number) => (
                <div key={i} style={{
                  padding: "6px 10px",
                  marginBottom: "4px",
                  background: b.includes("✅") ? "rgba(0,255,100,0.05)" : b.includes("⏳") ? "rgba(255,200,0,0.05)" : "rgba(255,0,0,0.05)",
                  border: `1px solid ${b.includes("✅") ? "#1a3a1a" : b.includes("⏳") ? "#3a3a1a" : "#3a1a1a"}`,
                  borderRadius: "2px",
                  fontSize: "11px",
                  color: b.includes("✅") ? "#39ff14" : b.includes("⏳") ? "#ffcc00" : "#ff4444",
                  fontFamily: "monospace",
                }}>
                  {b}
                </div>
              ))}
            </div>

            {/* Gauges */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "14px" }}>
              {[
                {
                  label: "ACTIONS",
                  value: dashboard.actions.today,
                  max: dashboard.actions.limit,
                  color: dashboard.actions.remaining < 5 ? "#ff4444" : "#39ff14",
                },
                {
                  label: "REPLIES",
                  value: dashboard.replies.today,
                  max: dashboard.replies.limit,
                  color: dashboard.replies.remaining < 5 ? "#ff4444" : "#39ff14",
                },
                {
                  label: "TWEETS",
                  value: dashboard.tweets.today,
                  max: 6,
                  color: "#39ff14",
                },
              ].map((g, i) => (
                <div key={i} style={{
                  background: "#0a0f0a",
                  border: "1px solid #1a2a1a",
                  borderRadius: "2px",
                  padding: "10px",
                  textAlign: "center" as const,
                }}>
                  <div style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "2px", marginBottom: "6px" }}>{g.label}</div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: g.color, fontFamily: "monospace" }}>
                    {g.value}<span style={{ fontSize: "11px", color: "#3a5a3a" }}>/{g.max}</span>
                  </div>
                  <div style={{
                    height: "3px",
                    background: "#1a2a1a",
                    borderRadius: "2px",
                    marginTop: "6px",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, (g.value / g.max) * 100)}%`,
                      background: g.color,
                      borderRadius: "2px",
                      transition: "width 0.3s",
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Timing */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "14px" }}>
              <div style={{
                background: "#0a0f0a", border: "1px solid #1a2a1a", borderRadius: "2px", padding: "8px 10px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "1px" }}>LAST ACTION</span>
                <span style={{ fontSize: "12px", color: "#39ff14", fontFamily: "monospace" }}>
                  {dashboard.throttle.lastActionMinAgo !== null ? `${dashboard.throttle.lastActionMinAgo}m ago` : "never"}
                </span>
              </div>
              <div style={{
                background: "#0a0f0a", border: "1px solid #1a2a1a", borderRadius: "2px", padding: "8px 10px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "1px" }}>LAST TWEET</span>
                <span style={{ fontSize: "12px", color: "#39ff14", fontFamily: "monospace" }}>
                  {dashboard.tweets.lastTweetMinAgo !== null ? `${dashboard.tweets.lastTweetMinAgo}m ago` : "never"}
                </span>
              </div>
              <div style={{
                background: "#0a0f0a", border: "1px solid #1a2a1a", borderRadius: "2px", padding: "8px 10px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "1px" }}>POLL RATE</span>
                <span style={{ fontSize: "12px", color: dashboard.adaptivePolling?.emptyStreak > 3 ? "#ffcc00" : "#39ff14", fontFamily: "monospace" }}>
                  {dashboard.adaptivePolling?.effectiveInterval || "15m"}
                </span>
              </div>
            </div>

            {/* Pillar Counts */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "2px", marginBottom: "6px" }}>PILLARS TODAY</div>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "6px" }}>
                {Object.entries(dashboard.tweets.pillarCounts || {}).map(([pillar, count]: [string, any]) => (
                  <div key={pillar} style={{
                    background: count > 0 ? "rgba(0,255,100,0.08)" : "#0a0f0a",
                    border: `1px solid ${count > 0 ? "#1a3a1a" : "#151f15"}`,
                    borderRadius: "2px",
                    padding: "4px 8px",
                    fontSize: "9px",
                    fontFamily: "monospace",
                    color: count > 0 ? "#39ff14" : "#3a5a3a",
                  }}>
                    {pillar.replace("_", " ").replace("disclosure conspiracy", "disclosure")}: {String(count)}
                  </div>
                ))}
              </div>
            </div>

            {/* User Interactions */}
            {dashboard.userInteractions && dashboard.userInteractions.length > 0 && (
              <div>
                <div style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "2px", marginBottom: "6px" }}>USER INTERACTIONS TODAY</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: "3px" }}>
                  {dashboard.userInteractions.map((u: any) => (
                    <div key={u.username} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "4px 8px", background: "#0a0f0a", borderRadius: "2px",
                      fontSize: "10px", fontFamily: "monospace",
                    }}>
                      <span style={{ color: u.isVip ? "#ffd700" : "#39ff14" }}>
                        {u.isVip ? "⭐ " : ""}@{u.username}
                      </span>
                      <span style={{ color: u.count >= u.limit ? "#ff4444" : "#3a5a3a" }}>
                        {u.count}/{u.limit} {u.count >= u.limit ? "⛔" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: "8px", color: "#2a3a2a", textAlign: "right" as const, marginTop: "8px" }}>
              updated {new Date(dashboard.timestamp).toLocaleTimeString()} · auto-refreshes every 60s
            </div>
          </div>
        )}

        {/* Scheduled Tweets */}
        {scheduled.length > 0 && (
          <div style={{ ...styles.panel, marginBottom: "16px" }}>
            <div style={styles.panelTitle}>◈ SCHEDULED POSTS ({scheduled.length})</div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px", marginTop: "10px" }}>
              {scheduled.map((t: any) => {
                const when = new Date(t.scheduledAt);
                const now = Date.now();
                const minsLeft = Math.round((t.scheduledAt - now) / 60000);
                const timeLabel = minsLeft > 60
                  ? `${Math.round(minsLeft / 60)}h ${minsLeft % 60}m`
                  : minsLeft > 0 ? `${minsLeft}m` : "due now";
                return (
                  <div key={t.id} style={{
                    background: "#0a0f0a",
                    border: "1px solid #1a3a1a",
                    borderRadius: "2px",
                    padding: "10px 12px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span style={{
                          fontSize: "9px", padding: "2px 6px",
                          background: "rgba(0,255,100,0.1)", border: "1px solid #1a3a1a",
                          borderRadius: "2px", color: "#39ff14", fontFamily: "monospace",
                        }}>
                          {t.pillar}
                        </span>
                        {t.hasImage && <span style={{ fontSize: "10px" }}>🖼️</span>}
                        <span style={{ fontSize: "9px", color: "#4a6a4a" }}>
                          {when.toLocaleString()} ({timeLabel})
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={async () => {
                            if (!confirm(`Publish this ${t.pillar} tweet NOW?`)) return;
                            setLoading(`pubSched-${t.id}`);
                            try {
                              const res = await fetch("/api/admin/scheduled", {
                                method: "POST",
                                headers: authHeaders,
                                body: JSON.stringify({ action: "publish", id: t.id }),
                              });
                              const data = await res.json();
                              if (data.error) addLog(`Publish failed: ${data.error}`, "error");
                              else {
                                addLog(`✓ Published: "${data.tweet.text}..." (ID: ${data.tweet.id})${data.tweet.hasImage ? " 🖼️" : ""}`, "success");
                                loadScheduled();
                              }
                            } catch (e) { addLog(`Publish failed: ${e}`, "error"); }
                            setLoading("");
                          }}
                          disabled={!!loading}
                          style={{
                            background: "transparent",
                            border: "1px solid #1a3a1a",
                            color: "#39ff14",
                            padding: "2px 8px",
                            fontFamily: "monospace",
                            fontSize: "10px",
                            cursor: "pointer",
                          }}
                        >
                          {loading === `pubSched-${t.id}` ? "..." : "🚀 POST NOW"}
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Cancel scheduled ${t.pillar} tweet?`)) return;
                            setLoading(`cancelSched-${t.id}`);
                            try {
                              const res = await fetch("/api/admin/scheduled", {
                                method: "POST",
                                headers: authHeaders,
                                body: JSON.stringify({ action: "cancel", id: t.id }),
                              });
                              const data = await res.json();
                              if (data.error) addLog(`Cancel failed: ${data.error}`, "error");
                              else {
                                addLog(`✓ Cancelled: "${data.cancelled.text}..."`, "warn");
                                loadScheduled();
                              }
                            } catch (e) { addLog(`Cancel failed: ${e}`, "error"); }
                            setLoading("");
                          }}
                          disabled={!!loading}
                          style={{
                            background: "transparent",
                            border: "1px solid #5a2a2a",
                            color: "#ff4444",
                            padding: "2px 8px",
                            fontFamily: "monospace",
                            fontSize: "10px",
                            cursor: "pointer",
                          }}
                        >
                          {loading === `cancelSched-${t.id}` ? "..." : "✕ CANCEL"}
                        </button>
                      </div>
                    </div>
                    <div style={{
                      fontSize: "11px", color: "#8aaa8a", fontFamily: "monospace",
                      lineHeight: "1.5", wordBreak: "break-word" as const,
                    }}>
                      {t.text.length > 200 ? t.text.substring(0, 200) + "..." : t.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div style={styles.grid}>
          {/* Left: Controls */}
          <div style={styles.panel}>
            <div style={styles.panelTitle}>◈ TWEET CONTROL</div>

            {/* Pillar Selector */}
            <div style={styles.label}>Content Pillar</div>
            <div style={styles.pillarGrid}>
              {PILLARS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPillar(p.id)}
                  style={{
                    ...styles.pillarBtn,
                    ...(selectedPillar === p.id ? styles.pillarBtnActive : {}),
                  }}
                >
                  <span style={styles.pillarIcon}>{p.icon}</span>
                  <span style={styles.pillarName}>{p.name}</span>
                </button>
              ))}
            </div>

            <div style={styles.pillarDesc}>
              {PILLARS.find((p) => p.id === selectedPillar)?.desc}
            </div>

            {/* Action Buttons */}
            <div style={styles.actions}>
              <button onClick={dryRun} disabled={!!loading} style={styles.btnPrimary}>
                {loading === "dry" ? "GENERATING..." : "👁️ DRY RUN (PREVIEW)"}
              </button>
              <button onClick={forcePost} disabled={!!loading} style={styles.btnPost}>
                {loading === "post" ? "POSTING..." : "🚀 FORCE POST TO X"}
              </button>
            </div>

            {/* Preview */}
            {preview && (
              <div style={styles.previewBox}>
                <div style={styles.previewHeader}>
                  <span>PREVIEW</span>
                  <span style={{ color: preview.charCount > 280 ? "#ff4444" : "#39ff14" }}>
                    {preview.charCount}/280
                  </span>
                </div>
                <div style={styles.previewText}>{preview.text}</div>
                {preview.imageUrl && (
                  <img src={preview.imageUrl} alt="Preview" style={styles.previewImage} />
                )}
                {preview.selfAwareness && (
                  <details style={{ marginTop: "10px", fontSize: "11px" }}>
                    <summary style={{ color: "#39ff14", cursor: "pointer", fontFamily: "monospace", letterSpacing: "1px", userSelect: "none" }}>
                      ◆ ET&apos;S MIND (self-awareness context injected)
                    </summary>
                    <pre style={{
                      marginTop: "8px",
                      padding: "10px",
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid #1a3a1a",
                      borderRadius: "4px",
                      color: "#7a9f7a",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: "10px",
                      lineHeight: "1.5",
                      maxHeight: "300px",
                      overflow: "auto",
                    }}>{preview.selfAwareness}</pre>
                  </details>
                )}
                <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                  <button
                    onClick={async () => {
                      if (!confirm("Tweet this exact preview to X now?")) return;
                      setLoading("postPreview");
                      addLog("Posting preview to X...", "info");
                      try {
                        const res = await fetch("/api/manual/tweet", {
                          method: "POST",
                          headers: authHeaders,
                          body: JSON.stringify({
                            pillar: preview.pillar,
                            text: preview.text,
                            imageUrl: preview.imageUrl || undefined,
                          }),
                        });
                        const data = await res.json();
                        if (data.error) { addLog(`Post failed: ${data.error}`, "error"); }
                        else { addLog(`✓ Tweeted: "${data.tweet.text.slice(0, 60)}..." (ID: ${data.tweet.id})${data.tweet.hasImage ? " 🖼️" : ""}`, "success"); setPreview(null); }
                      } catch (e) { addLog(`Post failed: ${e}`, "error"); }
                      setLoading("");
                    }}
                    disabled={!!loading}
                    style={{ ...styles.btnPost, flex: 1 }}
                  >
                    {loading === "postPreview" ? "POSTING..." : "🚀 TWEET NOW"}
                  </button>
                  <input
                    type="number"
                    id="scheduleHours"
                    placeholder="+hrs"
                    min="0.25"
                    step="0.25"
                    style={{ ...styles.input, width: "60px", textAlign: "center", fontSize: "11px" }}
                  />
                  <button
                    onClick={async () => {
                      const inp = document.getElementById("scheduleHours") as HTMLInputElement;
                      const hrs = parseFloat(inp?.value);
                      if (!hrs || hrs <= 0) { addLog("Enter hours to schedule (e.g. 2)", "warn"); return; }
                      setLoading("schedule");
                      addLog(`Scheduling tweet for +${hrs}h...`, "info");
                      try {
                        const res = await fetch("/api/manual/tweet", {
                          method: "POST",
                          headers: authHeaders,
                          body: JSON.stringify({
                            pillar: preview.pillar,
                            text: preview.text,
                            imageUrl: preview.imageUrl || undefined,
                            scheduleHours: hrs,
                          }),
                        });
                        const data = await res.json();
                        if (data.error) { addLog(`Schedule failed: ${data.error}`, "error"); }
                        else { addLog(`✓ Scheduled for ${new Date(data.scheduledFor).toLocaleTimeString()}: "${data.tweet.slice(0, 50)}..."`, "success"); setPreview(null); loadScheduled(); }
                      } catch (e) { addLog(`Schedule failed: ${e}`, "error"); }
                      setLoading("");
                    }}
                    disabled={!!loading}
                    style={styles.btnPrimary}
                  >
                    {loading === "schedule" ? "..." : "⏰ SCHEDULE"}
                  </button>
                </div>
              </div>
            )}
          </div>


          {/* Riddle Manager */}
          <div style={{ ...styles.panel, gridColumn: "1 / -1", marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={styles.panelTitle}>🧩 RIDDLE MANAGER</div>
              <button onClick={loadRiddles} style={{ ...styles.btnSmall, fontSize: "9px", padding: "2px 8px" }}>↻ REFRESH</button>
            </div>

            {/* Manual add form */}
            <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(57,255,20,0.1)", borderRadius: "4px", padding: "10px", marginBottom: "12px" }}>
              <div style={{ fontSize: "9px", color: "rgba(57,255,20,0.5)", letterSpacing: "0.1em", marginBottom: "8px" }}>＋ ADD RIDDLE MANUALLY</div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px" }}>
                <input
                  value={newRiddle.tweetUrl}
                  onChange={(e: any) => setNewRiddle(p => ({ ...p, tweetUrl: e.target.value }))}
                  placeholder="Tweet URL (the riddle tweet)"
                  style={{ ...styles.input, fontSize: "11px", padding: "4px 8px" }}
                />
                <textarea
                  value={newRiddle.question}
                  onChange={(e: any) => setNewRiddle(p => ({ ...p, question: e.target.value }))}
                  placeholder="The riddle / question (what ET asked)"
                  rows={2}
                  style={{ ...styles.input, fontSize: "11px", padding: "4px 8px", resize: "vertical" as const, fontFamily: "monospace" }}
                />
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input
                    value={newRiddle.answer}
                    onChange={(e: any) => setNewRiddle(p => ({ ...p, answer: e.target.value }))}
                    placeholder="Correct answer (only visible to admin)"
                    style={{ ...styles.input, fontSize: "11px", padding: "4px 8px", flex: 1 }}
                  />
                  <button
                    onClick={async () => {
                      if (!newRiddle.question.trim()) { addLog("Enter the riddle question first", "warn"); return; }
                      setLoading("riddleAnswerGen");
                      const res = await fetch("/api/admin/riddle-answer", {
                        method: "POST",
                        headers: { ...authHeaders, "Content-Type": "application/json" },
                        body: JSON.stringify({ question: newRiddle.question }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setNewRiddle(p => ({ ...p, answer: data.answer }));
                        addLog("ET determined the answer — review before saving", "info");
                      } else { addLog(`Error: ${data.error}`, "error"); }
                      setLoading("");
                    }}
                    disabled={!!loading}
                    style={{ ...styles.btnSmall, fontSize: "9px", padding: "4px 10px", whiteSpace: "nowrap" as const, background: "rgba(57,255,20,0.06)", borderColor: "rgba(57,255,20,0.15)", color: "rgba(57,255,20,0.6)" }}
                  >
                    {loading === "riddleAnswerGen" ? "thinking..." : "👽 ASK ET"}
                  </button>
                </div>
                <button
                  onClick={async () => {
                    if (!newRiddle.tweetUrl || !newRiddle.question || !newRiddle.answer) {
                      addLog("Fill in all three fields", "warn"); return;
                    }
                    setLoading("riddleAdd");
                    const res = await fetch("/api/admin/riddles", {
                      method: "POST",
                      headers: { ...authHeaders, "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "manual_add", tweetUrl: newRiddle.tweetUrl, question: newRiddle.question, answer: newRiddle.answer }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      addLog(`✅ Riddle added (tweet ${data.tweetId})`, "success");
                      setNewRiddle({ tweetUrl: "", question: "", answer: "" });
                      loadRiddles();
                    } else { addLog(`Error: ${data.error}`, "error"); }
                    setLoading("");
                  }}
                  disabled={!!loading}
                  style={{ ...styles.btnSmall, fontSize: "10px", padding: "4px 10px", background: "rgba(57,255,20,0.08)", borderColor: "rgba(57,255,20,0.2)", color: "#39ff14" }}
                >
                  {loading === "riddleAdd" ? "..." : "＋ ADD RIDDLE"}
                </button>
              </div>
            </div>

            {riddles.length === 0 ? (
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "12px 0" }}>no active riddles</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: "12px" }}>
                {riddles.map((r: any) => (
                  <div key={r.tweetId} style={{ background: r.solved ? "rgba(0,0,0,0.2)" : "rgba(57,255,20,0.03)", border: `1px solid ${r.solved ? "rgba(255,255,255,0.08)" : "rgba(57,255,20,0.12)"}`, borderRadius: "4px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "9px", color: r.solved ? "rgba(255,200,0,0.5)" : "rgba(57,255,20,0.5)", letterSpacing: "0.1em" }}>
                        {r.solved ? `✅ SOLVED — winner: @${r.solvedBy}` : "🔴 OPEN"}
                      </span>
                      <a href={`https://x.com/etalienx/status/${r.tweetId}`} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: "9px", color: "rgba(100,200,255,0.6)", textDecoration: "none" }}>VIEW TWEET ↗</a>
                    </div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", marginBottom: "4px", lineHeight: "1.5" }}>
                      <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px" }}>RIDDLE: </span>{r.question?.substring(0, 150)}
                    </div>
                    <div style={{ fontSize: "11px", color: "rgba(57,255,20,0.6)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px" }}>ANSWER: </span>
                      {showRiddleAnswer[r.tweetId]
                        ? <span style={{ color: "rgba(57,255,20,0.85)" }}>{r.answer}</span>
                        : <span style={{ color: "rgba(255,255,255,0.15)", fontSize: "11px", letterSpacing: "0.15em" }}>••••••••••</span>
                      }
                      <button
                        onClick={() => setShowRiddleAnswer(p => ({ ...p, [r.tweetId]: !p[r.tweetId] }))}
                        style={{ background: "transparent", border: "1px solid rgba(57,255,20,0.2)", color: "rgba(57,255,20,0.5)", fontSize: "9px", padding: "2px 8px", cursor: "pointer", fontFamily: "monospace", borderRadius: "2px" }}
                      >
                        {showRiddleAnswer[r.tweetId] ? "HIDE" : "REVEAL"}
                      </button>
                    </div>
                    {!r.solved && (
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "10px" }}>

                        {/* Check if winner */}
                        <div style={{ marginBottom: "12px" }}>
                          <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", marginBottom: "6px" }}>🔍 CHECK REPLY — paste a reply URL to see if it is correct:</div>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <input
                              value={checkReplyUrl[r.tweetId] || ""}
                              onChange={(e: any) => {
                                setCheckReplyUrl(p => ({ ...p, [r.tweetId]: e.target.value }));
                                setCheckVerdict(p => { const n = {...p}; delete n[r.tweetId]; return n; });
                              }}
                              placeholder="https://x.com/.../status/..."
                              style={{ ...styles.input, fontSize: "11px", padding: "4px 8px", flex: 1 }}
                            />
                            <button
                              onClick={async () => {
                                const url = checkReplyUrl[r.tweetId];
                                if (!url) { addLog("Paste a reply URL first", "warn"); return; }
                                setLoading("check_" + r.tweetId);
                                const res = await fetch("/api/admin/riddle-check", {
                                  method: "POST",
                                  headers: { ...authHeaders, "Content-Type": "application/json" },
                                  body: JSON.stringify({ tweetId: r.tweetId, replyUrl: url }),
                                });
                                const data = await res.json();
                                if (data.success) setCheckVerdict(p => ({ ...p, [r.tweetId]: data }));
                                else addLog(`Check failed: ${data.error}`, "error");
                                setLoading("");
                              }}
                              disabled={!!loading}
                              style={{ ...styles.btnSmall, fontSize: "9px", padding: "4px 10px", whiteSpace: "nowrap" as const }}
                            >
                              {loading === "check_" + r.tweetId ? "checking..." : "CHECK"}
                            </button>
                          </div>
                          {checkVerdict[r.tweetId] && (() => {
                            const v = checkVerdict[r.tweetId];
                            const correct = v.verdict?.correct;
                            const confidence = v.verdict?.confidence;
                            const color = correct ? "#00ff64" : confidence === "low" ? "#ff4444" : "#ffcc00";
                            const icon = correct ? "✅" : "❌";
                            return (
                              <div style={{ marginTop: "8px", background: "rgba(0,0,0,0.3)", border: `1px solid ${color}33`, borderRadius: "3px", padding: "8px 10px" }}>
                                <div style={{ fontSize: "10px", color, fontWeight: 700, marginBottom: "4px" }}>
                                  {icon} @{v.replyAuthor} — {correct ? "CORRECT" : "WRONG"} ({confidence} confidence)
                                </div>
                                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", marginBottom: "4px", fontStyle: "italic" }}>
                                  "{v.replyText?.substring(0, 120)}"
                                </div>
                                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>{v.verdict?.reasoning}</div>
                                {correct && (
                                  <button
                                    onClick={() => {
                                      setRiddleWinner(p => ({ ...p, [r.tweetId]: { winner: v.replyAuthor, wallet: "", tweetUrl: checkReplyUrl[r.tweetId] } }));
                                      addLog(`@${v.replyAuthor} pre-filled as winner — add wallet and confirm below`, "info");
                                    }}
                                    style={{ marginTop: "6px", ...styles.btnSmall, fontSize: "9px", padding: "3px 8px", background: "rgba(0,255,100,0.1)", borderColor: "rgba(0,255,100,0.3)", color: "#00ff64" }}
                                  >
                                    → USE AS WINNER
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", marginBottom: "6px" }}>PICK WINNER — paste the winning reply details:</div>
                        <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px" }}>
                          <input
                            value={riddleWinner[r.tweetId]?.winner || ""}
                            onChange={(e: any) => setRiddleWinner((prev: any) => ({ ...prev, [r.tweetId]: { ...prev[r.tweetId], winner: e.target.value } }))}
                            placeholder="@winner username"
                            style={{ ...styles.input, fontSize: "11px", padding: "4px 8px" }}
                          />
                          <input
                            value={riddleWinner[r.tweetId]?.tweetUrl || ""}
                            onChange={(e: any) => setRiddleWinner((prev: any) => ({ ...prev, [r.tweetId]: { ...prev[r.tweetId], tweetUrl: e.target.value } }))}
                            placeholder="URL to their winning reply tweet"
                            style={{ ...styles.input, fontSize: "11px", padding: "4px 8px" }}
                          />
                          <input
                            value={riddleWinner[r.tweetId]?.wallet || ""}
                            onChange={(e: any) => setRiddleWinner((prev: any) => ({ ...prev, [r.tweetId]: { ...prev[r.tweetId], wallet: e.target.value } }))}
                            placeholder="Solana wallet (optional — adds to rewards queue)"
                            style={{ ...styles.input, fontSize: "11px", padding: "4px 8px" }}
                          />
                          <button
                            onClick={async () => {
                              const w = riddleWinner[r.tweetId] || {};
                              if (!w.winner) { addLog("Enter winner username", "warn"); return; }
                              if (!w.tweetUrl) { addLog("Enter the winning reply URL", "warn"); return; }
                              setLoading("riddle_" + r.tweetId);
                              const res = await fetch("/api/admin/riddles", {
                                method: "POST",
                                headers: { ...authHeaders, "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "pick_winner", tweetId: r.tweetId, winner: w.winner, walletAddress: w.wallet || "", winnerTweetUrl: w.tweetUrl }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                addLog(`✅ @${w.winner} picked as riddle winner${w.wallet ? " — added to rewards queue" : ""}`, "success");
                                setRiddleWinner((prev: any) => { const n = {...prev}; delete n[r.tweetId]; return n; });
                                loadRiddles();
                                if (w.wallet) loadRewardsQueue();
                              } else { addLog(`Error: ${data.error}`, "error"); }
                              setLoading("");
                            }}
                            disabled={!!loading}
                            style={{ ...styles.btnSmall, fontSize: "10px", padding: "4px 12px", background: "rgba(57,255,20,0.08)", borderColor: "rgba(57,255,20,0.25)", color: "#39ff14" }}
                          >
                            {loading === "riddle_" + r.tweetId ? "..." : "✓ PICK AS WINNER"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Prompt ET — custom tweet */}
          <div style={{ ...styles.panel, gridColumn: "1 / -1" }}>
            <div style={styles.panelTitle}>✍️ PROMPT ET</div>
            <div style={{ fontSize: "10px", color: "#4a6a4a", marginBottom: "12px", lineHeight: "1.6" }}>
              Tell ET what to tweet. He'll write it in character. Preview and approve before it goes live.
            </div>
            <textarea
              value={promptText}
              onChange={(e: any) => { setPromptText(e.target.value); setPromptPreview(null); }}
              placeholder={`e.g. "tweet a task for humans to solve a riddle only someone who follows ET closely can answer — no AI can solve it"`}
              rows={3}
              style={{ ...styles.input, width: "100%", resize: "vertical" as const, padding: "10px", fontSize: "11px", lineHeight: "1.6", fontFamily: "monospace", boxSizing: "border-box" as const }}
            />
            {promptPreview && (
              <div style={{ marginTop: "8px" }}>
                <input
                  value={riddleAnswer}
                  onChange={(e: any) => setRiddleAnswer(e.target.value)}
                  placeholder="Correct answer (optional — only fill if this is a riddle/challenge)"
                  style={{ ...styles.input, width: "100%", fontSize: "11px", padding: "8px", boxSizing: "border-box" as const }}
                />
                <div style={{ fontSize: "9px", color: "rgba(57,255,20,0.35)", marginTop: "4px" }}>
                  If filled, ET will remember the answer and act as judge when humans reply. Leave blank for regular tweets.
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" as const }}>
              <button
                onClick={async () => {
                  if (!promptText.trim()) { addLog("Enter a prompt first", "warn"); return; }
                  setLoading("promptDry");
                  setPromptPreview(null);
                  const res = await fetch("/api/admin/prompt-tweet", {
                    method: "POST",
                    headers: { ...authHeaders, "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: promptText, post: false }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setPromptPreview(data.tweet);
                    addLog(`Preview ready (${data.tweet.length} chars)`, "info");
                  } else { addLog(`Error: ${data.error}`, "error"); }
                  setLoading("");
                }}
                disabled={!!loading}
                style={styles.btnPrimary}
              >
                {loading === "promptDry" ? "GENERATING..." : "👁️ PREVIEW"}
              </button>
              {promptPreview && (
                <>
                  <button
                    onClick={async () => {
                      setLoading("promptDry");
                      setPromptPreview(null);
                      const res = await fetch("/api/admin/prompt-tweet", {
                        method: "POST",
                        headers: { ...authHeaders, "Content-Type": "application/json" },
                        body: JSON.stringify({ prompt: promptText, post: false }),
                      });
                      const data = await res.json();
                      if (data.success) { setPromptPreview(data.tweet); addLog("Regenerated", "info"); }
                      else { addLog(`Error: ${data.error}`, "error"); }
                      setLoading("");
                    }}
                    disabled={!!loading}
                    style={{ ...styles.btnSmall, padding: "6px 14px" }}
                  >
                    ↺ REGENERATE
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Post this tweet to ET's timeline?")) return;
                      setLoading("promptPost");
                      const res = await fetch("/api/admin/prompt-tweet", {
                        method: "POST",
                        headers: { ...authHeaders, "Content-Type": "application/json" },
                        body: JSON.stringify({ prompt: promptText, post: true, riddleAnswer }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        addLog(`✅ Posted: "${data.tweet.substring(0, 60)}..." (${data.tweetId})${data.hasRiddle ? " — riddle answer stored 🧩" : ""}`, "success");
                        setPromptText("");
                        setPromptPreview(null);
                        setRiddleAnswer("");
                      } else { addLog(`Post failed: ${data.error}`, "error"); }
                      setLoading("");
                    }}
                    disabled={!!loading}
                    style={styles.btnPost}
                  >
                    {loading === "promptPost" ? "POSTING..." : "🚀 APPROVE & POST"}
                  </button>
                </>
              )}
            </div>
            {promptPreview && (
              <div style={{ marginTop: "12px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(57,255,20,0.15)", borderRadius: "4px", padding: "12px 14px" }}>
                <div style={{ fontSize: "9px", color: "rgba(57,255,20,0.4)", letterSpacing: "0.1em", marginBottom: "6px" }}>PREVIEW — {promptPreview.length}/280</div>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.85)", lineHeight: "1.6", whiteSpace: "pre-wrap" as const }}>{promptPreview}</div>
              </div>
            )}
          </div>


          {/* Right: Activity Log */}
          <div style={styles.panel}>
            <div style={styles.panelTitle}>◈ ACTIVITY LOG</div>
            <div style={styles.logContainer}>
              {log.length === 0 ? (
                <div style={styles.logEmpty}>No activity yet. Awaiting commands...</div>
              ) : (
                log.map((entry, i) => (
                  <div key={i} style={styles.logEntry}>
                    <span style={styles.logTime}>{entry.time}</span>
                    <span style={styles.logMsg(entry.type)}>{entry.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Pillar Reference */}
        <div style={styles.panel}>
          <div style={styles.panelTitle}>◈ TARGET QUEUE</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <input
              type="text"
              id="adminTargetInput"
              placeholder="@username"
              style={{ ...styles.input, flex: 1, textAlign: "left" }}
              onKeyDown={(e: any) => { if (e.key === "Enter") document.getElementById("adminForceBtn")?.click(); }}
            />
            <button
              id="adminForceBtn"
              onClick={async () => {
                const inp = document.getElementById("adminTargetInput") as HTMLInputElement;
                const handle = inp?.value.trim();
                if (!handle) { addLog("Enter a handle first", "warn"); return; }
                setLoading("force");
                addLog(`Force-adding @${handle} to queue...`, "info");
                try {
                  const res = await fetch("/api/targets/admin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "force", handle, secret }),
                  });
                  const data = await res.json();
                  if (data.error) addLog(`Error: ${data.error}`, "error");
                  else { addLog(`✓ @${data.target.handle} forced to front of queue`, "success"); inp.value = ""; }
                } catch (e) { addLog(`Force failed: ${e}`, "error"); }
                setLoading("");
              }}
              disabled={!!loading}
              style={styles.btnPrimary}
            >
              {loading === "force" ? "..." : "⚡ FORCE"}
            </button>
            <button
              onClick={async () => {
                const inp = document.getElementById("adminTargetInput") as HTMLInputElement;
                const handle = inp?.value.trim() || undefined;
                setLoading("interact");
                addLog(handle ? `Interacting with @${handle}...` : "Interacting with next target in queue...", "info");
                try {
                  const res = await fetch("/api/targets/admin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "interact", handle, secret }),
                  });
                  const data = await res.json();
                  if (data.error) addLog(`Error: ${data.error}`, "error");
                  else if (data.success) addLog(`✓ Replied to @${data.handle}: "${(data.replyText || "").slice(0, 60)}..."`, "success");
                  else addLog(`Failed: ${data.error}`, "error");
                } catch (e) { addLog(`Interact failed: ${e}`, "error"); }
                setLoading("");
              }}
              disabled={!!loading}
              style={styles.btnPost}
            >
              {loading === "interact" ? "..." : "🎯 INTERACT"}
            </button>
          </div>
          <div style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "1px", marginBottom: "10px" }}>
            FORCE: adds to front of queue · INTERACT: replies to their latest tweet now (leave blank for next in queue)
          </div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <input
              type="text"
              id="adminTweetUrl"
              placeholder="https://x.com/user/status/123..."
              style={{ ...styles.input, flex: 1, textAlign: "left", fontSize: "10px" }}
              onKeyDown={(e: any) => { if (e.key === "Enter") document.getElementById("adminDryReplyBtn")?.click(); }}
            />
            <button
              id="adminDryReplyBtn"
              onClick={async () => {
                const inp = document.getElementById("adminTweetUrl") as HTMLInputElement;
                const tweetUrl = inp?.value.trim();
                if (!tweetUrl) { addLog("Paste a tweet URL first", "warn"); return; }
                setLoading("dryReply");
                setReplyPreview(null);
                addLog(`Generating reply preview: ${tweetUrl.substring(0, 60)}...`, "info");
                try {
                  const res = await fetch("/api/targets/admin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "dryReply", tweetUrl, secret }),
                  });
                  const data = await res.json();
                  if (data.error) addLog(`Error: ${data.error}`, "error");
                  else if (data.replyText) {
                    setReplyPreview({
                      tweetUrl,
                      replyText: data.replyText,
                      originalText: data.originalText || "",
                      originalAuthor: data.originalAuthor || "",
                      tweetId: data.tweetId || "",
                    });
                    addLog(`✓ Preview ready — @${data.originalAuthor}: "${(data.originalText || "").slice(0, 50)}..."`, "success");
                  }
                } catch (e) { addLog(`Dry run failed: ${e}`, "error"); }
                setLoading("");
              }}
              disabled={!!loading}
              style={styles.btnPrimary}
            >
              {loading === "dryReply" ? "..." : "👁️ DRY RUN"}
            </button>
            <button
              id="adminReplyBtn"
              onClick={async () => {
                const inp = document.getElementById("adminTweetUrl") as HTMLInputElement;
                const tweetUrl = inp?.value.trim();
                if (!tweetUrl) { addLog("Paste a tweet URL first", "warn"); return; }
                setLoading("reply");
                addLog(`Replying to tweet: ${tweetUrl.substring(0, 60)}...`, "info");
                try {
                  const res = await fetch("/api/targets/admin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "reply", tweetUrl, secret }),
                  });
                  const data = await res.json();
                  if (data.error) addLog(`Error: ${data.error}`, "error");
                  else if (data.success) { const m = data.method === "quote" ? "Quote tweeted" : data.method === "standalone" ? "Standalone" : "Replied"; addLog(`✓ ${m}: "${(data.replyText || "").slice(0, 80)}..."`, "success"); inp.value = ""; setReplyPreview(null); }
                  else addLog(`Failed: ${data.error}`, "error");
                } catch (e) { addLog(`Reply failed: ${e}`, "error"); }
                setLoading("");
              }}
              disabled={!!loading}
              style={styles.btnPost}
            >
              {loading === "reply" ? "..." : "💬 REPLY NOW"}
            </button>
          </div>

          {/* Reply Preview */}
          {replyPreview && (
            <div style={{
              background: "#0a0f0a",
              border: "1px solid #1a3a1a",
              borderRadius: "2px",
              padding: "10px 12px",
              marginBottom: "12px",
            }}>
              <div style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "2px", marginBottom: "8px" }}>REPLY PREVIEW</div>
              <div style={{ fontSize: "10px", color: "#5a7a5a", marginBottom: "8px", fontStyle: "italic" }}>
                @{replyPreview.originalAuthor}: &quot;{replyPreview.originalText.length > 100 ? replyPreview.originalText.substring(0, 100) + "..." : replyPreview.originalText}&quot;
              </div>
              <div style={{
                fontSize: "12px", color: "#39ff14", fontFamily: "monospace",
                lineHeight: "1.6", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const,
                padding: "8px", background: "#050a05", borderRadius: "2px", marginBottom: "8px",
              }}>
                {replyPreview.replyText}
              </div>
              <div style={{ fontSize: "9px", color: replyPreview.replyText.length > 280 ? "#ff4444" : "#3a5a3a", marginBottom: "8px" }}>
                {replyPreview.replyText.length}/280
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={async () => {
                    setLoading("dryReply");
                    setReplyPreview(null);
                    addLog("Regenerating...", "info");
                    try {
                      const res = await fetch("/api/targets/admin", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "dryReply", tweetUrl: replyPreview.tweetUrl, secret }),
                      });
                      const data = await res.json();
                      if (data.replyText) {
                        setReplyPreview({ ...replyPreview, replyText: data.replyText });
                        addLog("✓ Regenerated", "success");
                      }
                    } catch (e) { addLog(`Regen failed: ${e}`, "error"); }
                    setLoading("");
                  }}
                  disabled={!!loading}
                  style={{ ...styles.btnSmall, flex: 1 }}
                >
                  ↻ REGENERATE
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Post this reply to X?")) return;
                    setLoading("postPreviewReply");
                    addLog("Posting preview reply...", "info");
                    try {
                      const res = await fetch("/api/targets/admin", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "postPreview", tweetUrl: replyPreview.tweetUrl, replyText: replyPreview.replyText, secret }),
                      });
                      const data = await res.json();
                      if (data.error) addLog(`Post failed: ${data.error}`, "error");
                      else {
                        const m = data.method === "quote" ? "Quote tweeted" : data.method === "standalone" ? "Standalone" : "Replied";
                        addLog(`✓ ${m}: "${(data.replyText || "").slice(0, 80)}..."`, "success");
                        setReplyPreview(null);
                        const inp = document.getElementById("adminTweetUrl") as HTMLInputElement;
                        if (inp) inp.value = "";
                      }
                    } catch (e) { addLog(`Post failed: ${e}`, "error"); }
                    setLoading("");
                  }}
                  disabled={!!loading}
                  style={{ ...styles.btnPost, flex: 1 }}
                >
                  {loading === "postPreviewReply" ? "POSTING..." : "🚀 POST THIS REPLY"}
                </button>
              </div>
            </div>
          )}

          <div style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "1px", marginBottom: "10px" }}>
            DRY RUN: preview ET's reply before posting · REPLY NOW: generate + post immediately
          </div>
          <button
            onClick={async () => {
              setLoading("loadTargets");
              try {
                const res = await fetch("/api/targets");
                const data = await res.json();
                if (data.targets?.length > 0) {
                  addLog(`Target queue (${data.targets.length}):`, "info");
                  for (const t of data.targets) {
                    addLog(`  ${t.forced ? "⚡" : "•"} @${t.handle} — ${t.votes} votes${t.forced ? " (FORCED)" : ""}`, t.forced ? "warn" : "info");
                  }
                } else addLog("Target queue is empty", "info");
              } catch (e) { addLog(`Load failed: ${e}`, "error"); }
              setLoading("");
            }}
            disabled={!!loading}
            style={{ ...styles.btnSmall, ...styles.btnWarn, marginBottom: "0" }}
          >
            {loading === "loadTargets" ? "..." : "📋 VIEW QUEUE"}
          </button>
        </div>

        <div style={styles.panel}>
          <div style={styles.panelTitle}>◈ REPLY CONTROL</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
            <button
              onClick={async () => {
                setLoading("replies");
                addLog("Checking mentions & generating replies...", "info");
                try {
                  const res = await fetch("/api/manual/replies", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ secret }),
                  });
                  const data = await res.json();
                  if (data.error) { addLog(`Reply error: ${data.error}`, "error"); setLoading(""); return; }
                  addLog(`Replies: ${data.replied} posted, ${data.skipped} skipped`, data.replied > 0 ? "success" : "info");
                  if (data.results) {
                    for (const r of data.results) {
                      if (r.skipped) {
                        addLog(`  ⊘ @${r.authorUsername}: ${r.skipReason}`, "warn");
                      } else {
                        addLog(`  ✓ @${r.authorUsername}: "${r.replyText.slice(0, 60)}..."`, "success");
                      }
                    }
                  }
                } catch (e) {
                  addLog(`Reply check failed: ${e}`, "error");
                }
                setLoading("");
              }}
              disabled={!!loading}
              style={styles.btnPrimary}
            >
              {loading === "replies" ? "PROCESSING..." : "📡 CHECK & REPLY TO MENTIONS"}
            </button>
            <button
              onClick={async () => {
                setLoading("catchup");
                addLog("CATCH-UP: Re-scanning recent mentions (ignoring cursor)...", "info");
                try {
                  const res = await fetch("/api/manual/replies", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ secret, catchUp: true }),
                  });
                  const data = await res.json();
                  if (data.error) { addLog(`Catch-up error: ${data.error}`, "error"); setLoading(""); return; }
                  addLog(`Catch-up: ${data.replied} posted, ${data.skipped} skipped`, data.replied > 0 ? "success" : "info");
                  if (data.results) {
                    for (const r of data.results) {
                      if (r.skipped) {
                        addLog(`  ⊘ @${r.authorUsername}: ${r.skipReason}`, "warn");
                      } else {
                        addLog(`  ✓ @${r.authorUsername}: "${r.replyText.slice(0, 60)}..."`, "success");
                      }
                    }
                  }
                } catch (e) {
                  addLog(`Catch-up failed: ${e}`, "error");
                }
                setLoading("");
              }}
              disabled={!!loading}
              style={{ ...styles.btnPrimary, background: "#2a3a2a" }}
            >
              {loading === "catchup" ? "CATCHING UP..." : "🔄 CATCH UP MISSED"}
            </button>
            <span style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "1px" }}>
              AUTO: every 15 min · MAX: 10/run · 75/day
            </span>
          </div>
          <div style={{ fontSize: "10px", color: "#4a6a4a", lineHeight: "1.6" }}>
            Fetches new @etalienx mentions → generates in-character replies via Claude → posts them.
            Skips empty tags, self-mentions, and already-replied threads. Kill switch pauses replies too.
            <br />CATCH UP: Re-scans recent mentions without cursor — picks up replies that were skipped due to volume.
          </div>
        </div>

        <div style={styles.panel}>
          <div style={styles.panelTitle}>◈ MEME ENGINE</div>
          <div style={{ fontSize: "10px", color: "#4a6a4a", marginBottom: "12px", lineHeight: "1.6" }}>
            Paste a tweet URL → ET photobombs, memes, roasts, or pays a visit. Preview first, then post as image reply.
          </div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
            <input
              type="text"
              id="memeTweetUrl"
              placeholder="https://x.com/user/status/123..."
              style={{ ...styles.input, flex: 1, textAlign: "left", fontSize: "10px" }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            {(["photobomb", "meme", "roast", "visit"] as const).map((m) => (
              <button
                key={m}
                onClick={async () => {
                  const url = (document.getElementById("memeTweetUrl") as HTMLInputElement)?.value.trim();
                  if (!url) { addLog("Paste a tweet URL first", "warn"); return; }
                  setLoading(`meme_${m}`);
                  setMemeResult(null);
                  addLog(`Meme engine (${m}): processing...`, "info");
                  try {
                    const res = await fetch("/api/admin/meme-test", {
                      method: "POST",
                      headers: authHeaders,
                      body: JSON.stringify({ tweetUrl: url, mode: m, action: "preview" }),
                    });
                    const data = await res.json();
                    if (data.error) {
                      addLog(`Error: ${data.error}`, "error");
                    } else {
                      setMemeResult(JSON.stringify({
                        dataUrl: data.result,
                        imageBase64: data.imageBase64,
                        tweetId: data.tweetId,
                        tweetUrl: url,
                        author: data.author,
                        tweetText: data.tweetText,
                        hasImages: data.hasImages,
                        imageFrom: data.imageFrom,
                        fellBack: data.fellBack,
                        mode: m,
                        elapsed: data.elapsed,
                      }));
                      addLog(`✓ ${m} preview ready (${data.elapsed}) — ${data.fellBack ? "⚠️ source blocked by safety filter, generated scene instead" : data.hasImages ? `edited image from @${data.imageFrom || data.author}` : "generated scene"} for @${data.author}`, "success");
                    }
                  } catch (e) { addLog(`Meme failed: ${e}`, "error"); }
                  setLoading("");
                }}
                disabled={!!loading}
                style={m === "photobomb" ? styles.btnPrimary : m === "roast" ? { ...styles.btnSmall, ...styles.btnWarn } : m === "visit" ? { ...styles.btnSmall, background: "rgba(128,0,255,0.15)", border: "1px solid #4a1a6a", color: "#b080ff" } : styles.btnPost}
              >
                {loading === `meme_${m}` ? "..." : m === "photobomb" ? "👽 PHOTOBOMB" : m === "meme" ? "🎭 MEME" : m === "visit" ? "👻 VISIT" : "🔥 ROAST"}
              </button>
            ))}
          </div>

          {memeResult && (() => {
            try {
              const d = JSON.parse(memeResult);
              return (
                <div style={{ marginTop: "4px" }}>
                  <div style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "2px", marginBottom: "6px" }}>
                    PREVIEW{d.fellBack ? " ⚠️ SAFETY FALLBACK" : ""} — @{d.author}: &quot;{(d.tweetText || "").substring(0, 80)}{d.tweetText?.length > 80 ? "..." : ""}&quot; ({d.imageFrom || (d.hasImages ? "image edited" : "scene generated")})
                  </div>
                  <div style={{
                    background: "#0a0f0a", border: "1px solid #1a3a1a", borderRadius: "2px",
                    padding: "8px", textAlign: "center" as const,
                  }}>
                    <img src={d.dataUrl} alt="Meme preview" style={{ maxWidth: "100%", maxHeight: "400px", borderRadius: "2px" }} />
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button
                      onClick={() => {
                        const url = (document.getElementById("memeTweetUrl") as HTMLInputElement)?.value.trim();
                        if (url) {
                          setLoading(`meme_${d.mode}`);
                          setMemeResult(null);
                          addLog(`Regenerating ${d.mode}...`, "info");
                          fetch("/api/admin/meme-test", {
                            method: "POST",
                            headers: authHeaders,
                            body: JSON.stringify({ tweetUrl: url, mode: d.mode, action: "preview" }),
                          }).then(r => r.json()).then(data => {
                            if (data.error) addLog(`Error: ${data.error}`, "error");
                            else {
                              setMemeResult(JSON.stringify({ ...d, dataUrl: data.result, imageBase64: data.imageBase64, elapsed: data.elapsed }));
                              addLog(`✓ Regenerated (${data.elapsed})`, "success");
                            }
                            setLoading("");
                          }).catch(e => { addLog(`Regen failed: ${e}`, "error"); setLoading(""); });
                        }
                      }}
                      disabled={!!loading}
                      style={{ ...styles.btnSmall, flex: 1 }}
                    >
                      ↻ REGENERATE
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm("Post this meme as a reply?")) return;
                        setLoading("memePost");
                        addLog("Posting meme reply...", "info");
                        try {
                          const res = await fetch("/api/admin/meme-test", {
                            method: "POST",
                            headers: authHeaders,
                            body: JSON.stringify({ tweetUrl: d.tweetUrl, action: "post", imageBase64: d.imageBase64 }),
                          });
                          const data = await res.json();
                          if (data.error) addLog(`Post failed: ${data.error}`, "error");
                          else {
                            addLog(`✓ Meme ${data.method === "reply" ? "replied" : "posted standalone"} (${data.replyId})`, "success");
                            setMemeResult(null);
                            (document.getElementById("memeTweetUrl") as HTMLInputElement).value = "";
                          }
                        } catch (e) { addLog(`Post failed: ${e}`, "error"); }
                        setLoading("");
                      }}
                      disabled={!!loading}
                      style={{ ...styles.btnPost, flex: 1 }}
                    >
                      {loading === "memePost" ? "POSTING..." : "🚀 POST MEME"}
                    </button>
                    <button
                      onClick={() => setMemeResult(null)}
                      style={{ ...styles.btnSmall }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            } catch { return null; }
          })()}
        </div>

        <div style={styles.panel}>
          <div style={styles.panelTitle}>◈ ARTICLE THREAD</div>
          <div style={{ fontSize: "10px", color: "#4a6a4a", marginBottom: "12px", lineHeight: "1.6" }}>
            Paste an article URL → ET reads it and writes a tweet thread with his alien perspective. Preview first, then post.
          </div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <input
              type="text"
              value={threadUrl}
              onChange={(e: any) => setThreadUrl(e.target.value)}
              placeholder="https://..."
              style={{ ...styles.input, flex: 1, textAlign: "left" }}
              onKeyDown={(e: any) => { if (e.key === "Enter") document.getElementById("threadGenBtn")?.click(); }}
            />
            <button
              id="threadGenBtn"
              onClick={async () => {
                if (!threadUrl.trim()) { addLog("Paste an article URL", "warn"); return; }
                setLoading("threadGen");
                setThreadPreview(null);
                addLog(`Reading article: ${threadUrl.substring(0, 60)}...`, "info");
                try {
                  const res = await fetch("/api/admin/thread", {
                    method: "POST",
                    headers: authHeaders,
                    body: JSON.stringify({ url: threadUrl, dryRun: true }),
                  });
                  const data = await res.json();
                  if (data.error) { addLog(`Error: ${data.error}`, "error"); }
                  else {
                    setThreadPreview(data.tweets);
                    addLog(`✓ Generated ${data.tweetCount}-tweet thread`, "success");
                  }
                } catch (e) { addLog(`Thread generation failed: ${e}`, "error"); }
                setLoading("");
              }}
              disabled={!!loading}
              style={styles.btnPrimary}
            >
              {loading === "threadGen" ? "READING..." : "📰 GENERATE"}
            </button>
          </div>

          {threadPreview && (
            <div style={{ marginTop: "8px" }}>
              <div style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "2px", marginBottom: "8px" }}>
                PREVIEW ({threadPreview.length} tweets)
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px", marginBottom: "12px" }}>
                {threadPreview.map((tweet, i) => {
                  const total = threadPreview.length;
                  const count = `[${i + 1}/${total}]`;
                  const isLast = i === total - 1;
                  let formatted = tweet;
                  if (i === 0 && threadUrl) {
                    formatted = `${tweet}\n\n${threadUrl}\n\n${count} 👇`;
                  } else if (isLast) {
                    formatted = `${tweet}\n\n${count}`;
                  } else {
                    formatted = `${tweet}\n\n${count} 👇`;
                  }
                  return (
                    <div key={i} style={{
                      background: "#0a0f0a",
                      border: "1px solid #1a3a1a",
                      borderRadius: "2px",
                      padding: "8px 10px",
                      display: "flex",
                      gap: "8px",
                    }}>
                      <span style={{ color: "#3a5a3a", fontSize: "10px", fontFamily: "monospace", minWidth: "16px" }}>
                        {i + 1}.
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: "11px", color: "#8aaa8a", fontFamily: "monospace",
                          lineHeight: "1.5", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const,
                        }}>
                          {formatted}
                        </div>
                        <div style={{ fontSize: "9px", color: formatted.length > 280 ? "#ff4444" : "#3a5a3a", marginTop: "4px" }}>
                          {formatted.length}/280
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={async () => {
                    setLoading("threadGen");
                    addLog("Regenerating thread...", "info");
                    try {
                      const res = await fetch("/api/admin/thread", {
                        method: "POST",
                        headers: authHeaders,
                        body: JSON.stringify({ url: threadUrl, dryRun: true }),
                      });
                      const data = await res.json();
                      if (data.error) addLog(`Error: ${data.error}`, "error");
                      else {
                        setThreadPreview(data.tweets);
                        addLog(`✓ Regenerated ${data.tweetCount}-tweet thread`, "success");
                      }
                    } catch (e) { addLog(`Regen failed: ${e}`, "error"); }
                    setLoading("");
                  }}
                  disabled={!!loading}
                  style={{ ...styles.btnSmall, flex: 1 }}
                >
                  {loading === "threadGen" ? "..." : "↻ REGENERATE"}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`Post this ${threadPreview.length}-tweet thread to X?`)) return;
                    setLoading("threadPost");
                    addLog("Posting thread to X...", "info");
                    try {
                      const res = await fetch("/api/admin/thread", {
                        method: "POST",
                        headers: authHeaders,
                        body: JSON.stringify({ url: threadUrl, dryRun: false, tweets: threadPreview }),
                      });
                      const data = await res.json();
                      if (data.error) addLog(`Post failed: ${data.error}`, "error");
                      else {
                        addLog(`✓ Thread posted! ${data.tweetCount} tweets (first: ${data.thread[0]?.id})`, "success");
                        setThreadPreview(null);
                        setThreadUrl("");
                      }
                    } catch (e) { addLog(`Thread post failed: ${e}`, "error"); }
                    setLoading("");
                  }}
                  disabled={!!loading}
                  style={{ ...styles.btnPost, flex: 1 }}
                >
                  {loading === "threadPost" ? "POSTING..." : `🚀 POST THREAD (${threadPreview.length} tweets)`}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={styles.panel}>
          <div style={styles.panelTitle}>◈ PRIORITY USERS</div>
          <div style={{ fontSize: "10px", color: "#4a6a4a", marginBottom: "12px", lineHeight: "1.6" }}>
            Priority users get 30 interactions/day (vs 10 default). Add users ET should engage with more.
          </div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <input
              type="text"
              id="vipInput"
              placeholder="@username"
              style={{ ...styles.input, flex: 1, textAlign: "left" }}
              onKeyDown={(e: any) => { if (e.key === "Enter") document.getElementById("vipAddBtn")?.click(); }}
            />
            <button
              id="vipAddBtn"
              onClick={async () => {
                const inp = document.getElementById("vipInput") as HTMLInputElement;
                const handle = inp?.value.trim().replace(/^@/, "");
                if (!handle) { addLog("Enter a handle first", "warn"); return; }
                setLoading("vipAdd");
                addLog(`Adding @${handle} to priority list...`, "info");
                try {
                  const res = await fetch("/api/admin/vip", {
                    method: "POST",
                    headers: authHeaders,
                    body: JSON.stringify({ action: "add", username: handle }),
                  });
                  const data = await res.json();
                  if (data.error) addLog(`Error: ${data.error}`, "error");
                  else {
                    addLog(`✓ @${handle} added to priority list (30/day limit)`, "success");
                    inp.value = "";
                    setVipUsers(data.vipUsers || []);
                  }
                } catch (e) { addLog(`Add failed: ${e}`, "error"); }
                setLoading("");
              }}
              disabled={!!loading}
              style={styles.btnPrimary}
            >
              {loading === "vipAdd" ? "..." : "＋ ADD"}
            </button>
          </div>
          {vipUsers.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px" }}>
              {vipUsers.map((u) => (
                <div key={u} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "#0a1a0a",
                  border: "1px solid #1a3a1a",
                  borderRadius: "2px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ color: "#ffd700", fontSize: "11px" }}>⭐</span>
                    <span style={{ color: "#39ff14", fontWeight: 700, fontSize: "12px" }}>@{u}</span>
                    <span style={{ color: "#3a5a3a", fontSize: "9px" }}>30/day</span>
                  </div>
                  <button
                    onClick={async () => {
                      setLoading(`vipRm-${u}`);
                      try {
                        const res = await fetch("/api/admin/vip", {
                          method: "POST",
                          headers: authHeaders,
                          body: JSON.stringify({ action: "remove", username: u }),
                        });
                        const data = await res.json();
                        if (data.error) addLog(`Error: ${data.error}`, "error");
                        else {
                          addLog(`✓ @${u} removed from priority list`, "warn");
                          setVipUsers(data.vipUsers || []);
                        }
                      } catch (e) { addLog(`Remove failed: ${e}`, "error"); }
                      setLoading("");
                    }}
                    disabled={!!loading}
                    style={{
                      background: "transparent",
                      border: "1px solid #5a2a2a",
                      color: "#ff4444",
                      padding: "2px 8px",
                      fontFamily: "monospace",
                      fontSize: "10px",
                      cursor: "pointer",
                    }}
                  >
                    {loading === `vipRm-${u}` ? "..." : "✕ REMOVE"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#3a5a3a", fontSize: "10px", fontStyle: "italic", padding: "8px 0" }}>
              No priority users. Default limit is 10 interactions/day per user.
            </div>
          )}
        </div>

        <div style={styles.panel}>
          <div style={styles.panelTitle}>◈ DAILY TARGET REFERENCE</div>
          <div style={styles.targetGrid}>
            {PILLARS.map((p) => {
              const targets: Record<string, string> = {
                human_observation: "2–3/day",
                research_drop: "1/day",
                crypto_community: "1–2/day",
                personal_lore: "0–1/day",
                existential: "1/day",
                disclosure_conspiracy: "1–2/day",
              };
              return (
                <div key={p.id} style={styles.targetCard}>
                  <span>{p.icon}</span>
                  <span style={styles.targetName}>{p.name}</span>
                  <span style={styles.targetCount}>{targets[p.id]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span>cron: every 15m · intervals: randomized</span>
          <span>·</span>
          <span>model: sonnet (bulk + replies) / opus (lore)</span>
          <span>·</span>
          <span>images: DALL-E 3 (lore only)</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLES — Terminal green aesthetic matching the main site
// ============================================================

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    background: "#020802",
    color: "#a0b8a0",
    fontFamily: "'Courier New', monospace",
    fontSize: "12px",
    display: "flex",
    justifyContent: "center",
    padding: "20px",
  },
  container: {
    width: "100%",
    maxWidth: "1000px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 0",
    borderBottom: "1px solid rgba(57,255,20,0.15)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "12px" },
  logo: {
    fontFamily: "monospace",
    fontSize: "16px",
    fontWeight: 700,
    color: "#39ff14",
    letterSpacing: "4px",
    textShadow: "0 0 15px rgba(57,255,20,0.4)",
  },
  badge: {
    fontSize: "9px",
    color: "#4a6a4a",
    border: "1px solid #1a3a1a",
    padding: "2px 6px",
    letterSpacing: "1px",
  },
  homeLink: {
    color: "#4a6a4a",
    textDecoration: "none",
    fontSize: "11px",
    letterSpacing: "1px",
  },
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    background: "rgba(10,21,10,0.5)",
    border: "1px solid rgba(57,255,20,0.1)",
  },
  statusItem: { display: "flex", alignItems: "center", gap: "8px", letterSpacing: "2px", fontSize: "11px" },
  statusDot: (color: string) => ({
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: color,
    boxShadow: `0 0 8px ${color}`,
    display: "inline-block",
  }),
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  panel: {
    background: "rgba(10,21,10,0.3)",
    border: "1px solid rgba(57,255,20,0.1)",
    padding: "16px",
  },
  panelTitle: {
    fontSize: "11px",
    color: "#39ff14",
    letterSpacing: "2px",
    marginBottom: "14px",
    textShadow: "0 0 8px rgba(57,255,20,0.3)",
  },
  label: {
    fontSize: "9px",
    color: "#4a6a4a",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
    marginBottom: "8px",
  },
  pillarGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "6px",
    marginBottom: "10px",
  },
  pillarBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 10px",
    background: "rgba(2,8,2,0.6)",
    border: "1px solid rgba(57,255,20,0.1)",
    color: "#4a6a4a",
    fontFamily: "monospace",
    fontSize: "10px",
    cursor: "pointer",
    transition: "all 0.2s",
    textAlign: "left" as const,
  },
  pillarBtnActive: {
    borderColor: "#39ff14",
    color: "#39ff14",
    background: "rgba(57,255,20,0.06)",
    boxShadow: "0 0 10px rgba(57,255,20,0.1)",
  },
  pillarIcon: { fontSize: "14px" },
  pillarName: { letterSpacing: "0.5px" },
  pillarDesc: {
    fontSize: "10px",
    color: "#4a6a4a",
    fontStyle: "italic" as const,
    marginBottom: "16px",
    paddingLeft: "4px",
  },
  actions: { display: "flex", flexDirection: "column" as const, gap: "8px" },
  btnPrimary: {
    padding: "10px 16px",
    background: "rgba(57,255,20,0.08)",
    border: "1px solid rgba(57,255,20,0.4)",
    color: "#39ff14",
    fontFamily: "monospace",
    fontSize: "11px",
    letterSpacing: "2px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  btnPost: {
    padding: "10px 16px",
    background: "rgba(255,170,0,0.06)",
    border: "1px solid rgba(255,170,0,0.3)",
    color: "#ffaa00",
    fontFamily: "monospace",
    fontSize: "11px",
    letterSpacing: "2px",
    cursor: "pointer",
  },
  btnSmall: {
    padding: "6px 14px",
    fontFamily: "monospace",
    fontSize: "10px",
    letterSpacing: "2px",
    cursor: "pointer",
    border: "1px solid",
  },
  btnDanger: {
    background: "rgba(255,68,68,0.08)",
    borderColor: "rgba(255,68,68,0.4)",
    color: "#ff4444",
  },
  btnWarn: {
    background: "rgba(255,170,0,0.08)",
    borderColor: "rgba(255,170,0,0.3)",
    color: "#ffaa00",
  },
  previewBox: {
    marginTop: "14px",
    padding: "14px",
    background: "rgba(2,8,2,0.8)",
    border: "1px solid rgba(57,255,20,0.2)",
  },
  previewHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "9px",
    color: "#4a6a4a",
    letterSpacing: "2px",
    marginBottom: "10px",
  },
  previewText: {
    color: "#c0d8c0",
    fontSize: "13px",
    lineHeight: "1.6",
    wordBreak: "break-word" as const,
  },
  previewImage: {
    marginTop: "10px",
    width: "100%",
    borderRadius: "0",
    border: "1px solid rgba(57,255,20,0.1)",
  },
  logContainer: {
    maxHeight: "400px",
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: "2px",
  },
  logEmpty: {
    color: "#2a4a2a",
    fontStyle: "italic" as const,
    padding: "20px",
    textAlign: "center" as const,
  },
  logEntry: {
    display: "flex",
    gap: "10px",
    padding: "4px 0",
    borderBottom: "1px solid rgba(57,255,20,0.04)",
    fontSize: "10px",
  },
  logTime: { color: "#2a4a2a", flexShrink: 0, fontVariantNumeric: "tabular-nums" },
  logMsg: (type: string) => ({
    color: type === "success" ? "#39ff14" : type === "error" ? "#ff4444" : type === "warn" ? "#ffaa00" : "#6a8a6a",
    wordBreak: "break-word" as const,
  }),
  targetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "8px",
  },
  targetCard: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "4px",
    padding: "10px 6px",
    background: "rgba(2,8,2,0.4)",
    border: "1px solid rgba(57,255,20,0.06)",
    textAlign: "center" as const,
  },
  targetName: { fontSize: "8px", color: "#4a6a4a", letterSpacing: "0.5px" },
  targetCount: { fontSize: "11px", color: "#39ff14", letterSpacing: "1px" },
  footer: {
    display: "flex",
    justifyContent: "center",
    gap: "12px",
    padding: "16px 0",
    color: "#1a3a1a",
    fontSize: "10px",
    letterSpacing: "1px",
    borderTop: "1px solid rgba(57,255,20,0.06)",
  },
  loginBox: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "80vh",
  },
  ascii: {
    color: "#39ff14",
    fontSize: "13px",
    textShadow: "0 0 10px rgba(57,255,20,0.3)",
    marginBottom: "24px",
  },
  loginForm: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    width: "280px",
  },
  input: {
    padding: "10px 12px",
    background: "rgba(2,8,2,0.8)",
    border: "1px solid rgba(57,255,20,0.2)",
    color: "#39ff14",
    fontFamily: "monospace",
    fontSize: "12px",
    outline: "none",
    letterSpacing: "1px",
    textAlign: "center" as const,
  },
};
