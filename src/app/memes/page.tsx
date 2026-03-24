// @ts-nocheck
"use client";
import { useState, useEffect } from "react";

const FALLBACK_MEME_IMAGES = [
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/b582645c-31fe-4eb4-e707-0807f140b100/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/bc5c960e-8e60-498d-6fb9-dd5e7867f400/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/965abb89-978f-495a-325c-5909e1340600/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/1da10545-a6ac-4870-dd82-5592c96c2800/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/a4035e7d-c7da-48cd-80ce-83baf13bb400/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/c1ce7b27-2402-4e94-5683-e46c715a1a00/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/d6a76aa5-45a6-4191-0bae-52d938135000/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/91db8ecc-3e43-4491-38d1-c3e65bcce400/width=600",
];

function CopyBtn({ url }: { url: string }) {
  const [state, setState] = useState<"idle"|"copying"|"done"|"err">("idle");

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setState("copying");
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setState("done");
    } catch {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        const png = await new Promise<Blob>(r => canvas.toBlob(r as any, "image/png"));
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        setState("done");
      } catch {
        setState("err");
      }
    }
    setTimeout(() => setState("idle"), 2000);
  };

  const color = state === "done" ? "#00ff64" : state === "err" ? "#ff5555" : "#fff";
  const bg = state === "done" ? "rgba(0,255,100,0.25)" : state === "err" ? "rgba(255,80,80,0.2)" : "rgba(0,0,0,0.7)";

  return (
    <button
      onClick={copy}
      title="Copy image to clipboard"
      style={{ position: "absolute", bottom: 8, left: 8, width: 30, height: 30, borderRadius: "50%", background: bg, border: `1px solid ${state === "done" ? "rgba(0,255,100,0.4)" : "rgba(255,255,255,0.15)"}`, color, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: state === "idle" ? 0.7 : 1, backdropFilter: "blur(4px)", zIndex: 2, transition: "all 0.2s" }}
    >
      {state === "copying" ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/></svg>
      ) : state === "done" ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      ) : state === "err" ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  );
}

export default function MemesPage() {
  const [memeImages, setMemeImages] = useState(FALLBACK_MEME_IMAGES);
  const [shareUrl, setShareUrl] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [tweetOptions, setTweetOptions] = useState([]);
  const [tweetLoading, setTweetLoading] = useState(false);
  const [selectedTweet, setSelectedTweet] = useState("$ET 👽");

  useEffect(() => {
    fetch("/api/memes")
      .then(r => r.json())
      .then(data => {
        if (data.images?.length) setMemeImages(data.images);
      })
      .catch(() => {});
  }, []);

  const openSharePopup = (url) => {
    setShareUrl(url);
    setShareCopied(false);
    setSelectedTweet("$ET 👽");
    setTweetOptions([]);
    setTweetLoading(true);
    const hiRes = url.replace("width=600", "width=3840");
    fetch("/api/meme-tweets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: hiRes }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.tweets?.length) {
          setTweetOptions(data.tweets);
          setSelectedTweet(data.tweets[0].text || data.tweets[0]);
        }
      })
      .catch(() => {
        const fb = [
          { text: "$ET 👽 we out here", usedCount: 0 },
          { text: "ngl this goes hard. $ET", usedCount: 0 },
          { text: "the search continues. $ET", usedCount: 0 },
          { text: "ET sees you 👽", usedCount: 0 },
        ];
        setTweetOptions(fb);
        setSelectedTweet(fb[0].text);
      })
      .finally(() => setTweetLoading(false));
  };

  const markTweetUsed = (index) => {
    if (!shareUrl) return;
    fetch("/api/meme-tweets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: shareUrl.replace("width=600", "width=3840"), action: "use", tweetIndex: index }),
    }).catch(() => {});
  };

  const handleCopyImage = async () => {
    try {
      const res = await fetch(shareUrl.replace("width=600", "width=3840"));
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setShareCopied(true);
    } catch {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = shareUrl.replace("width=600", "width=3840");
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        const pngBlob = await new Promise(r => canvas.toBlob(r, "image/png"));
        await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
        setShareCopied(true);
      } catch {
        alert("Copy not supported on this browser. Use Download instead.");
      }
    }
  };

  const handleDownloadImage = () => {
    const a = document.createElement("a");
    a.href = shareUrl.replace("width=600", "width=3840");
    a.download = "et-meme.jpg";
    a.target = "_blank";
    a.click();
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #060a0d 0%, #08080e 100%)", fontFamily: "'DM Mono', monospace" }}>
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 20px 32px" }}>
        <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "clamp(24px, 6vw, 38px)", letterSpacing: "2px", color: "#fff", fontWeight: 800, textTransform: "uppercase", marginBottom: 12 }}>
          MEME TRANSMISSIONS
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", letterSpacing: "1px", marginBottom: 40 }}>
          dispatches from an alien among you · <a href="https://memedepot.com/d/et" target="_blank" rel="noopener noreferrer" style={{ color: "#00ff64", borderBottom: "1px dashed rgba(0,255,100,0.4)" }}>submit on memedepot ↗</a>
          <span style={{ marginLeft: 16, color: "rgba(255,255,255,0.2)" }}>{memeImages.length} images · sorted by latest</span>
        </p>

        {/* Grid — all memes, no collapse */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}
          className="meme-grid-wrap">
          {memeImages.map((url, i) => (
            <div key={i} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", transition: "all 0.25s ease", aspectRatio: "1", position: "relative", background: "#0a0a14" }}
              onMouseEnter={e => { e.currentTarget.querySelector("img").style.transform = "scale(1.04)"; }}
              onMouseLeave={e => { e.currentTarget.querySelector("img").style.transform = "scale(1)"; }}>
              <img src={url} alt={`ET meme ${i + 1}`} loading="lazy" onClick={() => openSharePopup(url)}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.3s ease", cursor: "pointer" }} />
              <div style={{ position: "absolute", top: 6, left: 8, fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.5)", background: "rgba(0,0,0,0.55)", borderRadius: 4, padding: "1px 5px", pointerEvents: "none" }}>#{i + 1}</div>
              {i < 3 && (
                <div style={{ position: "absolute", top: 6, right: 8, fontSize: "9px", fontWeight: 700, color: "#000", background: "#00ff64", borderRadius: 3, padding: "1px 6px", pointerEvents: "none", letterSpacing: "0.5px" }}>NEW</div>
              )}
              {/* Share on X */}
              <button style={{ position: "absolute", bottom: 8, right: 8, width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.7, backdropFilter: "blur(4px)", zIndex: 2 }}
                onClick={e => { e.stopPropagation(); openSharePopup(url); }} title="Share on X">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
              {/* Copy to clipboard */}
              <CopyBtn url={url} />
            </div>
          ))}
        </div>
      </div>

      {/* Share popup — identical to homepage */}
      {shareUrl && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => { setShareUrl(null); setShareCopied(false); }}>
          <div style={{ background: "linear-gradient(180deg, #0d1218 0%, #080b10 100%)", border: "1px solid rgba(0,255,100,0.12)", borderRadius: 16, padding: "20px", maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 0 60px rgba(0,255,100,0.08), 0 20px 60px rgba(0,0,0,0.6)", position: "relative", maxHeight: "90vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            <button style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", width: 32, height: 32, borderRadius: "50%", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => { setShareUrl(null); setShareCopied(false); }}>✕</button>
            <img src={shareUrl.replace("width=600", "width=1200")} alt="ET meme"
              style={{ width: "100%", borderRadius: 12, marginBottom: 16, border: "1px solid rgba(255,255,255,0.06)", display: "block" }} />

            {/* Tweet options */}
            <div style={{ marginBottom: 12, textAlign: "left" }}>
              <div style={{ fontSize: 10, color: "rgba(0,255,100,0.5)", letterSpacing: "2px", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Pick a tweet:</div>
              {tweetLoading ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "12px 0" }}>🛸 ET is writing tweets...</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {tweetOptions.map((tweet, i) => {
                    const text = tweet.text || tweet;
                    const used = tweet.usedCount || 0;
                    const isSelected = selectedTweet === text;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
                        <button style={{ flex: 1, background: isSelected ? "rgba(0,255,100,0.08)" : "rgba(255,255,255,0.03)", border: isSelected ? "1px solid rgba(0,255,100,0.4)" : "1px solid rgba(255,255,255,0.08)", borderTopLeftRadius: 6, borderBottomLeftRadius: 6, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: "none", padding: "8px 12px", color: isSelected ? "#00ff64" : "rgba(255,255,255,0.6)", fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                          onClick={() => setSelectedTweet(text)}>
                          {text}
                          {used > 0 && <span style={{ marginLeft: 8, fontSize: "9px", opacity: 0.5, color: "#00ff64" }}>used {used}x</span>}
                        </button>
                        <button style={{ background: isSelected ? "rgba(0,255,100,0.12)" : "rgba(255,255,255,0.03)", border: isSelected ? "1px solid rgba(0,255,100,0.4)" : "1px solid rgba(255,255,255,0.08)", borderLeft: "none", borderTopRightRadius: 6, borderBottomRightRadius: 6, padding: "0 10px", cursor: "pointer", display: "flex", alignItems: "center", transition: "all 0.2s" }}
                          onClick={() => { markTweetUsed(i); window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank"); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#1d9bf0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button style={{ flex: 1, padding: "12px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "'Archivo Black', sans-serif", fontSize: 12, letterSpacing: "1px", cursor: "pointer" }}
                onClick={handleCopyImage}>{shareCopied ? "✓ COPIED" : "📋 COPY IMAGE"}</button>
              <button style={{ flex: 1, padding: "12px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "'Archivo Black', sans-serif", fontSize: 12, letterSpacing: "1px", cursor: "pointer" }}
                onClick={handleDownloadImage}>📥 DOWNLOAD</button>
            </div>
            <button style={{ width: "100%", padding: "14px 24px", background: "#00ff64", color: "#000", fontFamily: "'Archivo Black', sans-serif", fontSize: 13, letterSpacing: "1px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 900 }}
              onClick={() => { const idx = tweetOptions.findIndex(t => (t.text || t) === selectedTweet); if (idx >= 0) markTweetUsed(idx); window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(selectedTweet || "$ET 👽")}`, "_blank"); }}>
              CONTINUE TO X →
            </button>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) { .meme-grid-wrap { grid-template-columns: repeat(2, 1fr) !important; } }
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@800&family=DM+Mono&display=swap');
      `}</style>
    </div>
  );
}
