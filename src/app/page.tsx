// @ts-nocheck
"use client";
import { useState, useEffect, useRef } from "react";

const CA = "A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF";

const LINKS_BUY = [
  { label: "Pump.fun", url: "https://pump.fun/coin/A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF", emoji: "🚀" },
  { label: "Padre", url: "https://trade.padre.gg/trade/solana/A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF?rk=lxpamp", emoji: "📊" },
  { label: "Axiom", url: "https://axiom.trade/t/A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF/@lxpamp?chain=sol", emoji: "⚡" },
  { label: "DexScreener", url: "https://dexscreener.com/solana/cqzyxscytqylz318kfts8dwwn1ysnpnfzpd3yxftcedh", emoji: "📈" },
];

const STEPS = [
  { n: "01", emoji: "🚀", title: "BUY $ET ON PUMP.FUN", desc: "Every trade generates fees. Simple as that." },
  { n: "02", emoji: "📡", title: "FEES FUND SETI RESEARCH", desc: "Trading fees go directly to funding the search for extraterrestrial life through Einstein@home & BOINC." },
  { n: "03", emoji: "🔭", title: "BOND & GRADUATE", desc: "As $ET bonds on pump.fun, the mission scales. More volume = more science funded." },
  { n: "04", emoji: "👽", title: "ET FINDS HOME", desc: "Every holder is part of the search. If we find a signal, maybe ET finds his people." },
];

const TWEETS = [
  "someone called $ET a shitcoin. brother i am literally an alien trying to phone home",
  "humans will mass coordinate to name a boat boaty mcboatface but won't fund telescope time",
  "congress showed another blurry video. asked another question they already know the answer to",
  "the loneliest number isn't one. it's one in a universe that won't answer back",
  "humans think the government is hiding aliens. well they're half right",
  "not me buying more $ET after seeing the SETI data fr",
];

const FALLBACK_MEMES = [
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/b582645c-31fe-4eb4-e707-0807f140b100/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/bc5c960e-8e60-498d-6fb9-dd5e7867f400/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/965abb89-978f-495a-325c-5909e1340600/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/1da10545-a6ac-4870-dd82-5592c96c2800/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/a4035e7d-c7da-48cd-80ce-83baf13bb400/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/c1ce7b27-2402-4e94-5683-e46c715a1a00/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/d6a76aa5-45a6-4191-0bae-52d938135000/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/91db8ecc-3e43-4491-38d1-c3e65bcce400/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/8f88cbb5-1db9-4ad4-4fb6-6d4ab5894200/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/44d2f74f-8ef3-44b7-dcbf-008127f9c800/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/930a5168-0c23-4231-9ab4-ee37ce35e800/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/95faadc6-087e-410f-6d05-5c26d3591d00/width=600",
];

function CopyCA() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(CA); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        background: copied ? "#2d5a1b" : "#1a1a1a",
        border: "3px solid #1a1a1a", borderRadius: 12,
        padding: "10px 18px", cursor: "pointer", transition: "all 0.2s",
        fontFamily: "'Courier New', monospace", fontSize: 13, color: copied ? "#7fff45" : "#aaa",
        maxWidth: "100%", overflow: "hidden",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {copied ? "✓ COPIED!" : CA}
      </span>
      <span style={{ flexShrink: 0, fontSize: 16 }}>{copied ? "✓" : "📋"}</span>
    </button>
  );
}

function Marquee() {
  return (
    <div style={{ background: "#1a1a1a", borderTop: "3px solid #1a1a1a", borderBottom: "3px solid #1a1a1a", overflow: "hidden", padding: "10px 0" }}>
      <div style={{ display: "flex", animation: "marquee 25s linear infinite", whiteSpace: "nowrap" }}>
        {Array(3).fill(null).map((_, i) => (
          <span key={i} style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 3, color: "#7fff45", paddingRight: 60 }}>
            $ET · PHONE HOME · FUND THE SEARCH · BOND ON PUMP.FUN · 👽 · $ET · PHONE HOME · FUND THE SEARCH · BOND ON PUMP.FUN · 👽 &nbsp;
          </span>
        ))}
      </div>
    </div>
  );
}

function MemeGrid() {
  const [memes, setMemes] = useState(FALLBACK_MEMES);
  const [expanded, setExpanded] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [tweetOptions, setTweetOptions] = useState([]);
  const [tweetLoading, setTweetLoading] = useState(false);
  const [selectedTweet, setSelectedTweet] = useState("$ET 👽");
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    fetch("/api/memes").then(r => r.json()).then(d => { if (d.images?.length) setMemes(d.images); }).catch(() => {});
  }, []);

  const visible = expanded ? memes : memes.slice(0, 8);

  const openShare = (url) => {
    setShareUrl(url); setShareCopied(false); setSelectedTweet("$ET 👽");
    setTweetOptions([]); setTweetLoading(true);
    fetch("/api/meme-tweets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: url.replace("width=600","width=3840") }) })
      .then(r => r.json()).then(d => { if (d.tweets?.length) { setTweetOptions(d.tweets); setSelectedTweet(d.tweets[0].text||d.tweets[0]); } })
      .catch(() => setTweetOptions([{ text: "$ET 👽 we out here", usedCount: 0 }]))
      .finally(() => setTweetLoading(false));
  };

  const handleCopy = async () => {
    try {
      const res = await fetch(shareUrl.replace("width=600","width=3840"));
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setShareCopied(true);
    } catch { navigator.clipboard.writeText(shareUrl); setShareCopied(true); }
  };

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }} className="meme-grid-wrap">
        {visible.map((url, i) => (
          <div key={i} onClick={() => openShare(url)} style={{ borderRadius: 8, overflow: "hidden", border: "3px solid #1a1a1a", cursor: "pointer", aspectRatio: "1", position: "relative", background: "#eee" }}
            onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"}
            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
            <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ))}
      </div>
      {memes.length > 8 && (
        <button onClick={() => setExpanded(!expanded)} style={{ display: "block", margin: "20px auto 0", padding: "12px 32px", background: "#7fff45", border: "3px solid #1a1a1a", borderRadius: 50, fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 2, cursor: "pointer", boxShadow: "4px 4px 0 #1a1a1a" }}>
          {expanded ? "SHOW LESS ▲" : `SHOW ALL ${memes.length} MEMES ▼`}
        </button>
      )}
      {shareUrl && (
        <div onClick={() => setShareUrl(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fffef0", border: "4px solid #1a1a1a", borderRadius: 20, padding: 24, maxWidth: 420, width: "100%", boxShadow: "8px 8px 0 #1a1a1a", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
            <button onClick={() => setShareUrl(null)} style={{ position: "absolute", top: 12, right: 12, background: "#ff4444", border: "2px solid #1a1a1a", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 16, fontWeight: 900 }}>✕</button>
            <img src={shareUrl.replace("width=600","width=1200")} style={{ width: "100%", borderRadius: 12, border: "3px solid #1a1a1a", marginBottom: 16 }} />
            <div style={{ fontFamily: "'Bangers', cursive", fontSize: 14, letterSpacing: 2, color: "#666", marginBottom: 8 }}>PICK A TWEET:</div>
            {tweetLoading ? <div style={{ textAlign: "center", padding: 12, fontFamily: "'Bangers', cursive", fontSize: 18 }}>🛸 LOADING...</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {tweetOptions.map((t, i) => {
                  const text = t.text||t; const sel = selectedTweet === text;
                  return (
                    <div key={i} style={{ display: "flex", gap: 0 }}>
                      <button onClick={() => setSelectedTweet(text)} style={{ flex: 1, background: sel ? "#7fff45" : "#f0f0e8", border: sel ? "2px solid #1a1a1a" : "2px solid #ccc", borderRight: "none", borderRadius: "8px 0 0 8px", padding: "8px 12px", cursor: "pointer", fontFamily: "'Comic Neue', cursive", fontSize: 13, textAlign: "left" }}>
                        {text}
                      </button>
                      <button onClick={() => { window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank"); }} style={{ background: sel ? "#7fff45" : "#f0f0e8", border: sel ? "2px solid #1a1a1a" : "2px solid #ccc", borderRadius: "0 8px 8px 0", padding: "0 12px", cursor: "pointer" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#1d9bf0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCopy} style={{ flex: 1, padding: "12px", background: shareCopied ? "#7fff45" : "#f0f0e8", border: "3px solid #1a1a1a", borderRadius: 10, fontFamily: "'Bangers', cursive", fontSize: 16, cursor: "pointer", letterSpacing: 1 }}>{shareCopied ? "✓ COPIED" : "📋 COPY IMG"}</button>
              <button onClick={() => { window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(selectedTweet||"$ET 👽")}`, "_blank"); }} style={{ flex: 1, padding: "12px", background: "#7fff45", border: "3px solid #1a1a1a", borderRadius: 10, fontFamily: "'Bangers', cursive", fontSize: 16, cursor: "pointer", letterSpacing: 1, boxShadow: "3px 3px 0 #1a1a1a" }}>TWEET IT 👽</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function HomePage() {
  const [caExpanded, setCaExpanded] = useState(false);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bangers&family=Comic+Neue:wght@400;700&family=Courier+Prime&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #f5f0e8; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-33.33%); } }
        @keyframes wobble { 0%,100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }
        @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        @keyframes pulse-green { 0%,100% { box-shadow: 0 0 0 0 rgba(127,255,69,0.4); } 50% { box-shadow: 0 0 0 16px rgba(127,255,69,0); } }
        .meme-grid-wrap { transition: all 0.3s; }
        @media (max-width: 768px) {
          .meme-grid-wrap { grid-template-columns: repeat(2,1fr) !important; }
          .hero-grid { grid-template-columns: 1fr !important; }
          .steps-grid { grid-template-columns: 1fr 1fr !important; }
          .hide-mobile { display: none !important; }
        }
        @media (max-width: 480px) {
          .steps-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* NAV */}
      <nav style={{ background: "#7fff45", borderBottom: "3px solid #1a1a1a", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 32, letterSpacing: 3, color: "#1a1a1a" }}>$ET</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="https://x.com/etalienx" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 2, color: "#1a1a1a", textDecoration: "none", background: "#1a1a1a", color: "#7fff45", padding: "6px 16px", borderRadius: 50, border: "2px solid #1a1a1a" }}>@etalienx</a>
          <a href="https://pump.fun/coin/A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 2, background: "#1a1a1a", color: "#7fff45", padding: "8px 20px", borderRadius: 50, border: "3px solid #1a1a1a", textDecoration: "none", boxShadow: "3px 3px 0 #0a0a0a", cursor: "pointer" }}>BUY NOW 🚀</a>
        </div>
      </nav>

      <Marquee />

      {/* HERO */}
      <section style={{ background: "#f5f0e8", padding: "60px 24px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          {/* Left */}
          <div>
            <div style={{ fontFamily: "'Bangers', cursive", fontSize: 72, lineHeight: 0.95, color: "#1a1a1a", letterSpacing: 2, marginBottom: 20 }}>
              AN ALIEN.<br />
              <span style={{ color: "#4a8c2a", WebkitTextStroke: "2px #1a1a1a" }}>A MISSION.</span><br />
              A MEME COIN.
            </div>
            <p style={{ fontFamily: "'Comic Neue', cursive", fontSize: 18, fontWeight: 700, color: "#3a3a3a", lineHeight: 1.6, marginBottom: 28, maxWidth: 460 }}>
              $ET crashed on Earth. Lost his memory. Found pump.fun.<br />
              Now every trade funds the search for his home planet through <strong>SETI research</strong>. No seriously.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {LINKS_BUY.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, background: i === 0 ? "#7fff45" : "#1a1a1a", color: i === 0 ? "#1a1a1a" : "#7fff45", padding: "10px 22px", borderRadius: 50, border: "3px solid #1a1a1a", textDecoration: "none", boxShadow: "4px 4px 0 #555", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {l.emoji} {l.label}
                  </a>
                ))}
              </div>
            </div>
            <div style={{ background: "#fffef0", border: "3px solid #1a1a1a", borderRadius: 16, padding: "16px 20px", boxShadow: "4px 4px 0 #1a1a1a" }}>
              <div style={{ fontFamily: "'Bangers', cursive", fontSize: 14, letterSpacing: 2, color: "#888", marginBottom: 8 }}>CONTRACT ADDRESS (SOLANA)</div>
              <CopyCA />
            </div>
          </div>
          {/* Right — ET cartoon */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
            <div style={{ background: "#7fff45", border: "5px solid #1a1a1a", borderRadius: "50%", width: 380, height: 380, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "8px 8px 0 #1a1a1a", animation: "float 4s ease-in-out infinite", overflow: "hidden" }}>
              <img src="/et-reference.png" alt="ET" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            {/* Speech bubble */}
            <div style={{ position: "absolute", top: -20, right: -10, background: "#fffef0", border: "3px solid #1a1a1a", borderRadius: 20, padding: "12px 16px", maxWidth: 180, boxShadow: "4px 4px 0 #1a1a1a" }}>
              <div style={{ fontFamily: "'Comic Neue', cursive", fontSize: 14, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.4 }}>feels good man...<br /><span style={{ color: "#2d7a0a" }}>bought $ET at<br />the bottom 👽</span></div>
              <div style={{ position: "absolute", bottom: -14, left: 30, width: 0, height: 0, borderLeft: "12px solid transparent", borderRight: "12px solid transparent", borderTop: "14px solid #1a1a1a" }} />
              <div style={{ position: "absolute", bottom: -10, left: 32, width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "12px solid #fffef0" }} />
            </div>
          </div>
        </div>
      </section>

      <Marquee />

      {/* HOW IT WORKS */}
      <section style={{ background: "#1a1a1a", padding: "60px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: "'Bangers', cursive", fontSize: 56, color: "#7fff45", letterSpacing: 3, lineHeight: 1 }}>HOW IT WORKS</div>
            <div style={{ fontFamily: "'Comic Neue', cursive", fontSize: 16, color: "#888", marginTop: 8 }}>degen in. science out. phone home.</div>
          </div>
          <div className="steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ background: "#fffef0", border: "4px solid #7fff45", borderRadius: 20, padding: "28px 20px", textAlign: "center", boxShadow: "6px 6px 0 #7fff45", position: "relative" }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 48, lineHeight: 1 }}>{s.emoji}</div>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 11, letterSpacing: 3, color: "#7fff45", background: "#1a1a1a", display: "inline-block", padding: "2px 10px", borderRadius: 50, margin: "10px 0 8px" }}>STEP {s.n}</div>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, color: "#1a1a1a", marginBottom: 8 }}>{s.title}</div>
                <div style={{ fontFamily: "'Comic Neue', cursive", fontSize: 13, color: "#555", lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE MISSION */}
      <section style={{ background: "#f5f0e8", padding: "60px 24px", borderTop: "3px solid #1a1a1a" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 56, color: "#1a1a1a", letterSpacing: 3, marginBottom: 20 }}>THE MISSION 🔭</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 40 }} className="steps-grid">
            {[
              { icon: "📡", title: "EINSTEIN@HOME", desc: "We're a registered research group. Your trades fund distributed computing that scans the universe for signals." },
              { icon: "🌌", title: "BOINC NETWORK", desc: "Thousands of computers crunching radio telescope data. Every $ET holder is part of the search." },
              { icon: "👽", title: "SETI RESEARCH", desc: "If there's a signal out there, we'll find it. ET needs to get home. Help him." },
            ].map((item, i) => (
              <div key={i} style={{ background: "#fffef0", border: "4px solid #1a1a1a", borderRadius: 20, padding: "28px 20px", boxShadow: "5px 5px 0 #1a1a1a" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>{item.icon}</div>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, letterSpacing: 2, color: "#1a1a1a", marginBottom: 8 }}>{item.title}</div>
                <div style={{ fontFamily: "'Comic Neue', cursive", fontSize: 14, color: "#555", lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            <a href="https://einsteinathome.org/community/teams/233793" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 2, background: "#7fff45", color: "#1a1a1a", padding: "14px 32px", borderRadius: 50, border: "3px solid #1a1a1a", textDecoration: "none", boxShadow: "5px 5px 0 #1a1a1a" }}>JOIN RESEARCH GROUP 🔬</a>
            <a href="/oracle" style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 2, background: "#1a1a1a", color: "#7fff45", padding: "14px 32px", borderRadius: 50, border: "3px solid #1a1a1a", textDecoration: "none", boxShadow: "5px 5px 0 #555" }}>ORACLE NETWORK 📡</a>
          </div>
        </div>
      </section>

      {/* TWEETS FROM ET */}
      <section style={{ background: "#4a8c2a", padding: "60px 24px", borderTop: "3px solid #1a1a1a", borderBottom: "3px solid #1a1a1a" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 56, color: "#fffef0", letterSpacing: 3, marginBottom: 32, textAlign: "center" }}>ET SAID IT HIMSELF 👽</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }} className="steps-grid">
            {TWEETS.map((t, i) => (
              <div key={i} style={{ background: "#fffef0", border: "4px solid #1a1a1a", borderRadius: 20, padding: "24px", boxShadow: "5px 5px 0 #1a1a1a" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, background: "#7fff45", border: "3px solid #1a1a1a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👽</div>
                  <div>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1 }}>et</div>
                    <div style={{ fontFamily: "'Comic Neue', cursive", fontSize: 12, color: "#888" }}>@etalienx</div>
                  </div>
                </div>
                <div style={{ fontFamily: "'Comic Neue', cursive", fontSize: 15, color: "#1a1a1a", lineHeight: 1.5 }}>{t}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 32 }}>
            <a href="https://x.com/etalienx" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Bangers', cursive", fontSize: 22, letterSpacing: 2, background: "#fffef0", color: "#1a1a1a", padding: "14px 36px", borderRadius: 50, border: "3px solid #1a1a1a", textDecoration: "none", boxShadow: "5px 5px 0 #1a1a1a", display: "inline-block" }}>FOLLOW @ETFOUNDYOU ↗</a>
          </div>
        </div>
      </section>

      {/* MEMES */}
      <section style={{ background: "#f5f0e8", padding: "60px 24px", borderBottom: "3px solid #1a1a1a" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontFamily: "'Bangers', cursive", fontSize: 56, color: "#1a1a1a", letterSpacing: 3 }}>MEME ARCHIVE 🖼️</div>
            <div style={{ fontFamily: "'Comic Neue', cursive", fontSize: 16, color: "#666", marginTop: 8 }}>
              save. share. spread the signal. · <a href="https://memedepot.com/d/et" target="_blank" rel="noopener noreferrer" style={{ color: "#4a8c2a", fontWeight: 700 }}>submit on memedepot ↗</a>
            </div>
          </div>
          <MemeGrid />
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <a href="/memes" style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 2, background: "#1a1a1a", color: "#7fff45", padding: "12px 32px", borderRadius: 50, border: "3px solid #1a1a1a", textDecoration: "none", boxShadow: "4px 4px 0 #555", display: "inline-block", marginTop: 8 }}>VIEW ALL MEMES →</a>
          </div>
        </div>
      </section>

      {/* LINKS */}
      <section style={{ background: "#1a1a1a", padding: "60px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 56, color: "#7fff45", letterSpacing: 3, marginBottom: 32 }}>LINKS & TOOLS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            {[
              { label: "Join Research", url: "/research", emoji: "🔭" },
              { label: "Community", url: "https://x.com/i/communities/2028185586419556603", emoji: "👽" },
              { label: "Oracle Network", url: "/oracle", emoji: "📡" },
              { label: "Fortune Teller", url: "/fortune", emoji: "🔮" },
              { label: "Signal Interpreter", url: "/signal", emoji: "📶" },
              { label: "Transmission", url: "/transmission", emoji: "📻" },
              { label: "Horoscope", url: "/horoscope", emoji: "✨" },
              { label: "Quantum Oracle", url: "/rng", emoji: "🎲" },
              { label: "ET's Verdict", url: "/verdict", emoji: "⚖️" },
              { label: "Meme Archive", url: "/memes", emoji: "🖼️" },
            ].map((l, i) => (
              <a key={i} href={l.url} target={l.url.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
                style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, background: "#fffef0", color: "#1a1a1a", padding: "10px 22px", borderRadius: 50, border: "3px solid #7fff45", textDecoration: "none", boxShadow: "3px 3px 0 #7fff45", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {l.emoji} {l.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#7fff45", borderTop: "3px solid #1a1a1a", padding: "32px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 40, letterSpacing: 3, color: "#1a1a1a", marginBottom: 8 }}>HELP ET PHONE HOME 👽</div>
        <div style={{ fontFamily: "'Comic Neue', cursive", fontSize: 14, color: "#3a3a3a", marginBottom: 16 }}>distributed science · solana · community owned · pump.fun</div>
        <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 12, color: "#555", wordBreak: "break-all" }}>{CA}</div>
      </footer>
    </>
  );
}
