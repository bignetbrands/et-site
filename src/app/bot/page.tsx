"use client";

import { useState, useEffect, useCallback } from "react";

// ============================================================
// ET BOT — Mission Control Dashboard
// ============================================================

const PILLARS = [
  { id: "human_observation", name: "Human Observation", icon: "👁️", desc: "Alien perspective on human behavior" },
  { id: "research_drop", name: "Research Drop", icon: "📡", desc: "SETI, Einstein@home, space science" },
  { id: "crypto_community", name: "Crypto / Community", icon: "⚡", desc: "$ET updates, degen culture, BOINC" },
  { id: "personal_lore", name: "Personal Lore", icon: "🌑", desc: "Memories, the crash, parents (+ image)" },
  { id: "existential", name: "Existential", icon: "🌌", desc: "Big questions, loneliness, meaning" },
  { id: "disclosure_conspiracy", name: "Disclosure", icon: "🛸", desc: "UAP hearings, fun conspiracies" },
];

export default function BotDashboard() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [killSwitch, setKillSwitch] = useState(false);
  const [loading, setLoading] = useState("");
  const [log, setLog] = useState<Array<{ time: string; msg: string; type: "info" | "success" | "error" | "warn" }>>([]);
  const [preview, setPreview] = useState<{ text: string; pillar: string; imageUrl?: string; charCount: number } | null>(null);
  const [selectedPillar, setSelectedPillar] = useState("human_observation");

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
      setPreview({ text: data.tweet, pillar: data.pillar, imageUrl: data.imageUrl, charCount: data.charCount });
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
  };

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
          <a href="/" style={styles.homeLink}>← back to site</a>
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
                  <img src={preview.imageUrl} alt="Lore preview" style={styles.previewImage} />
                )}
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
            <span style={{ fontSize: "9px", color: "#4a6a4a", letterSpacing: "1px" }}>
              AUTO: every 15 min · MAX: 5/run · 50/day
            </span>
          </div>
          <div style={{ fontSize: "10px", color: "#4a6a4a", lineHeight: "1.6" }}>
            Fetches new @etalienx mentions → generates in-character replies via Claude → posts them.
            Skips empty tags, self-mentions, and already-replied threads. Kill switch pauses replies too.
          </div>
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
