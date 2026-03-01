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

export default function BackroomPage() {
  const [messages, setMessages] = useState<Array<{ text: string; who: "et" | "user" }>>([
    { text: "you found the backroom. this is where the community talks to me directly. you can chat, or if you've got ideas for how to make $ET better — drop them here. i'll process them into the suggestion board for everyone to vote on. what's on your mind?", who: "et" },
  ]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
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

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");

    setMessages(prev => [...prev, { text, who: "user" }]);
    const newHistory: ChatMessage[] = [...chatHistory, { role: "user", content: text }];
    setChatHistory(newHistory);

    // Show typing
    setMessages(prev => [...prev, { text: "...", who: "et" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newHistory,
          mode: "backroom",
        }),
      });
      const data = await res.json();
      const reply = data.reply || "ET's signal dropped. try again.";

      // Remove typing, add reply
      setMessages(prev => [...prev.slice(0, -1), { text: reply, who: "et" }]);
      setChatHistory(prev => [...prev, { role: "assistant", content: reply }]);

      // If ET detected a suggestion, auto-submit it
      if (data.suggestion) {
        try {
          await fetch("/api/backroom/suggestions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "submit",
              text,
              processedText: data.suggestion,
              submittedBy: "anon",
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

  return (
    <div style={styles.page}>
      {/* Scanlines */}
      <div style={styles.scanlines} />

      {/* Header */}
      <div style={styles.header}>
        <a href="/" style={styles.backLink}>← back to site</a>
        <div style={styles.headerTitle}>THE BACKROOM</div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={styles.suggestionsToggle}
        >
          {sidebarOpen ? "✕ close" : `◈ suggestions (${suggestions.length})`}
        </button>
      </div>

      <div style={styles.layout}>
        {/* CHAT PANEL */}
        <div style={styles.chatPanel}>
          <div style={styles.chatHeader}>
            <div style={styles.avatar}>👽</div>
            <div>
              <div style={styles.chatName}>$ET</div>
              <div style={styles.chatStatus}>online · stranded on earth · listening</div>
            </div>
          </div>

          <div style={styles.chatMessages}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={msg.who === "et" ? styles.msgEt : styles.msgUser}
              >
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
                    <span style={{ color: statusColor(s.status), textTransform: "uppercase", fontWeight: 700 }}>
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

// Mobile responsive override — sidebar as overlay on small screens
if (typeof window !== "undefined") {
  const mq = window.matchMedia("(max-width: 768px)");
  if (mq.matches) {
    styles.sidebar = {
      ...styles.sidebar,
      position: "fixed",
      top: "49px",
      right: 0,
      bottom: 0,
      zIndex: 50,
      transform: "translateX(100%)",
    };
    styles.sidebarOpen = {
      transform: "translateX(0)",
    };
  }
}
