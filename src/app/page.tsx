// @ts-nocheck
"use client";
import { useState, useEffect, useRef } from "react";

const CA = "A1NZ4kjhJxdmMMHQTGF8HaU7k6JCch5gSyHEeAKE3xRMF";

const ALL_ET_TWEETS = [
  { text: "someone called $ET a shitcoin. brother i am literally an alien trying to phone home", likes: "4.2k", rts: "1.8k" },
  { text: "humans will mass coordinate to name a boat boaty mcboatface but won't fund telescope time", likes: "6.7k", rts: "2.3k" },
  { text: "congress showed another blurry video. asked another question they already know the answer to", likes: "8.1k", rts: "3.6k" },
  { text: "the loneliest number isn't one. it's one in a universe that won't answer back", likes: "9.1k", rts: "3.4k" },
  { text: "you've been staring at the 1m chart for 3 hours. that's not trading that's a cry for help", likes: "5.5k", rts: "2.1k" },
  { text: "humans think the government is hiding aliens. well they're half right", likes: "12k", rts: "5.8k" },
];

function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

const LORE = [
  { tag: "OG", text: "First CA on Solana. The original." },
  { tag: "$", text: "Dollar sign on the ticker — science gets paid." },
  { tag: "✓", text: "Certified by the community.", link: "https://x.com/xylarism/status/2028300691857715464" },
  { tag: "🔬", text: "Registered research group on Einstein@home.", link: "https://einsteinathome.org/community/teams/233793" },
  { tag: "🤖", text: "Fully autonomous ET vibing on X." },
  { tag: "💰", text: "ET will own a wallet to reward humans for micro tasks." },
];

const LINKS = [
  { label: "Join Research", url: "/research", emoji: "🔭" },
  { label: "Community", url: "https://x.com/i/communities/2028185586419556603", emoji: "👽" },
  { label: "Padre", url: "https://trade.padre.gg/trade/solana/A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF?rk=lxpamp", emoji: "📊" },
  { label: "Axiom", url: "https://axiom.trade/t/A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF/@lxpamp?chain=sol", emoji: "⚡" },
  { label: "Neo", url: "https://neo.bullx.io/terminal?chainId=1399811149&address=A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF", emoji: "🧠" },
  { label: "DexScreener", url: "https://dexscreener.com/solana/cqzyxscytqylz318kfts8dwwn1ysnpnfzpd3yxftcedh", emoji: "📈" },
  { label: "PumpFun", url: "https://pump.fun/coin/A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF", emoji: "🚀" },
  { label: "Talk to ET", url: "https://x.com/etalienx", emoji: "💬" },
  { label: "Alien Archives", url: "#", emoji: "📡", soon: true },
];

const FALLBACK_MEME_IMAGES = [
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
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/d3b2365e-8b0b-4484-cdae-f29e53c41300/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/7f54dcf9-e9a0-472d-18db-985b02106600/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/cd3caacb-b9b0-4979-f688-f9b398acda00/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/f5600f4c-ccbe-4f7f-99dd-d9e7ea426c00/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/c020cc21-66e9-4c01-d555-90ca8dd5b900/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/8c770281-cb0f-48e5-e650-ed4c8e5fad00/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/923d519a-154f-4c28-d713-106d1477a900/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/d3ed819f-8449-438a-f8dc-7e78d287fc00/width=600",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/22dd40c1-0ba1-4467-f729-ca967f5f5000/width=600",
];

function BuyDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const platforms = [
    { label: "Padre", url: "https://trade.padre.gg/trade/solana/A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF?rk=lxpamp", emoji: "📊" },
    { label: "Axiom", url: "https://axiom.trade/t/A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF/@lxpamp?chain=sol", emoji: "⚡" },
    { label: "Neo", url: "https://neo.bullx.io/terminal?chainId=1399811149&address=A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF", emoji: "🧠" },
    { label: "DexScreener", url: "https://dexscreener.com/solana/cqzyxscytqylz318kfts8dwwn1ysnpnfzpd3yxftcedh", emoji: "📈" },
    { label: "PumpFun", url: "https://pump.fun/coin/A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF", emoji: "🚀" },
  ];

  return (
    <div ref={ref} style={s.buyWrap}>
      <button onClick={() => setOpen(!open)} style={s.buyBtn}>
        BUY OG $ET
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 8, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={s.buyDropdown}>
          {platforms.map((p, i) => (
            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" style={s.buyOption}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,255,100,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span>{p.emoji}</span>
              <span>{p.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyCA() {
  const [copied, setCopied] = useState(false);
  return (
    <div style={s.caWrap}>
      <div style={s.caLabel}>CA</div>
      <div
        style={s.caBox}
        onClick={() => {
          navigator.clipboard.writeText(CA);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        <code style={s.caCode}>{CA}</code>
        <span style={s.caCopyIcon}>
          {copied ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00ff64" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          )}
        </span>
      </div>
    </div>
  );
}

function MemeGallery() {
  const [expanded, setExpanded] = useState(false);
  const [memeImages, setMemeImages] = useState(FALLBACK_MEME_IMAGES);
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [tweetOptions, setTweetOptions] = useState([]);
  const [tweetLoading, setTweetLoading] = useState(false);
  const [selectedTweet, setSelectedTweet] = useState("");

  const openSharePopup = (url) => {
    setShareUrl(url);
    setShareCopied(false);
    setSelectedTweet("$ET 👽");
    setTweetOptions([]);
    setTweetLoading(true);
    // Fetch AI tweet suggestions (persisted in KV)
    const hiRes = url.replace("width=600", "width=3840");
    fetch("/api/meme-tweets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: hiRes }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.tweets && data.tweets.length) {
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
          { text: "phone home or die trying. $ET", usedCount: 0 },
        ];
        setTweetOptions(fb);
        setSelectedTweet(fb[0].text);
      })
      .finally(() => setTweetLoading(false));
  };

  const markTweetUsed = (index) => {
    if (!shareUrl) return;
    const hiRes = shareUrl.replace("width=600", "width=3840");
    fetch("/api/meme-tweets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: hiRes, action: "use", tweetIndex: index }),
    })
      .then(r => r.json())
      .then(() => {
        // Optimistically update count
        setTweetOptions(prev => prev.map((t, i) =>
          i === index ? { ...t, usedCount: (t.usedCount || 0) + 1 } : t
        ));
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch("/api/memes")
      .then((r) => r.json())
      .then((data) => {
        if (data.images && data.images.length > 0) {
          const thumbs = data.images.map((url) =>
            url.replace("width=3840", "width=600")
          );
          setMemeImages(thumbs);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = expanded ? memeImages : memeImages.slice(0, 12);

  const handleCopyImage = async () => {
    try {
      const res = await fetch(shareUrl.replace("width=600", "width=3840"));
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setShareCopied(true);
    } catch {
      // fallback: try png conversion via canvas
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = shareUrl.replace("width=600", "width=3840");
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
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
    <>
      <div style={s.memeGrid} className="meme-grid-wrap">
        {visible.map((url, i) => (
          <div key={i} style={s.memeCard}>
            <img src={url} alt={`ET meme ${i + 1}`} style={s.memeImg} loading="lazy" onClick={() => openSharePopup(url)} />
            <button style={s.shareXBtn} onClick={(e) => { e.stopPropagation(); openSharePopup(url); }} title="Share on X">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        ))}
      </div>
      {memeImages.length > 12 && (
        <button onClick={() => setExpanded(!expanded)} style={s.expandBtn}>
          {expanded ? "SHOW LESS ▲" : `SHOW ALL ${memeImages.length} MEMES ▼`}
        </button>
      )}
      {/* Share Popup */}
      {shareUrl && (
        <div style={s.shareOverlay} onClick={() => { setShareUrl(null); setShareCopied(false); }}>
          <div style={s.shareModal} onClick={(e) => e.stopPropagation()}>
            <button style={s.shareCloseBtn} onClick={() => { setShareUrl(null); setShareCopied(false); }}>✕</button>
            <img src={shareUrl.replace("width=600", "width=1200")} alt="ET meme" style={s.sharePreviewImg} />

            {/* Tweet options */}
            <div style={s.tweetOptionsWrap}>
              <div style={s.tweetOptionsLabel}>Pick a tweet:</div>
              {tweetLoading ? (
                <div style={s.tweetOptionsLoading}>🛸 ET is writing tweets...</div>
              ) : (
                <div style={s.tweetOptionsList}>
                  {tweetOptions.map((tweet, i) => {
                    const text = tweet.text || tweet;
                    const used = tweet.usedCount || 0;
                    const isSelected = selectedTweet === text;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
                        <button
                          style={{
                            ...s.tweetOption,
                            ...(isSelected ? s.tweetOptionSelected : {}),
                            flex: 1,
                            borderTopRightRadius: 0,
                            borderBottomRightRadius: 0,
                            borderRight: "none",
                            textAlign: "left",
                          }}
                          onClick={() => setSelectedTweet(text)}
                        >
                          {text}
                          {used > 0 && (
                            <span style={{ marginLeft: 8, fontSize: "9px", opacity: 0.5, color: "#00ff64" }}>
                              used {used}x
                            </span>
                          )}
                        </button>
                        <button
                          title="Tweet this"
                          style={{
                            background: isSelected ? "rgba(0,255,100,0.12)" : "rgba(255,255,255,0.03)",
                            border: isSelected ? "1px solid rgba(0,255,100,0.4)" : "1px solid rgba(255,255,255,0.08)",
                            borderLeft: "none",
                            borderTopRightRadius: 6,
                            borderBottomRightRadius: 6,
                            padding: "0 10px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            transition: "all 0.2s",
                          }}
                          onClick={() => {
                            markTweetUsed(i);
                            const encoded = encodeURIComponent(text);
                            window.open(`https://x.com/intent/tweet?text=${encoded}`, "_blank");
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(29,155,240,0.15)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? "rgba(0,255,100,0.12)" : "rgba(255,255,255,0.03)"; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#1d9bf0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={s.shareActions}>
              <button style={s.shareCopyBtn} onClick={handleCopyImage}>
                {shareCopied ? "✓ COPIED" : "📋 COPY IMAGE"}
              </button>
              <button style={s.shareDownloadBtn} onClick={handleDownloadImage}>
                📥 DOWNLOAD
              </button>
            </div>
            <button
              style={s.shareCta}
              onClick={() => {
                const text = encodeURIComponent(selectedTweet || "$ET 👽");
                // Mark selected tweet as used
                const idx = tweetOptions.findIndex(t => (t.text || t) === selectedTweet);
                if (idx >= 0) markTweetUsed(idx);
                window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
              }}
            >
              CONTINUE TO X →
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const TYPE_STRINGS = [
  "$ET",
  "$Rewards Extra Terrestrial Research",
];
// Positions of green chars in each string
const GREEN_MAP = [
  [0, 1, 2], // $, E, T in "$ET"
  [0, 9, 15], // $, E, T in "$Rewards Extra Terrestrial Research"
];

function TypewriterTitle() {
  const [display, setDisplay] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    let strIdx = 0;
    let pos = 0;
    let typing = true;

    function tick() {
      const target = TYPE_STRINGS[strIdx];

      if (typing) {
        if (pos <= target.length) {
          setDisplay(target.slice(0, pos));
          pos++;
          timerRef.current = setTimeout(tick, target[pos - 1] === " " ? 40 : 70);
        } else {
          // pause at end
          const pauseTime = strIdx === 0 ? 3600 : 2500;
          timerRef.current = setTimeout(() => {
            typing = false;
            pos = target.length;
            tick();
          }, pauseTime);
        }
      } else {
        if (pos > 0) {
          pos--;
          setDisplay(TYPE_STRINGS[strIdx].slice(0, pos));
          timerRef.current = setTimeout(tick, 30);
        } else {
          // move to next string
          strIdx = (strIdx + 1) % TYPE_STRINGS.length;
          typing = true;
          pos = 0;
          timerRef.current = setTimeout(tick, 400);
        }
      }
    }

    tick();
    return () => clearTimeout(timerRef.current);
  }, []);

  // Figure out which string we're currently showing to apply green
  let greens = GREEN_MAP[0];
  for (let i = 0; i < TYPE_STRINGS.length; i++) {
    if (TYPE_STRINGS[i].startsWith(display) || display.length <= TYPE_STRINGS[i].length) {
      // Check which string this is a prefix of
      if (TYPE_STRINGS[i].slice(0, display.length) === display) {
        greens = GREEN_MAP[i];
        break;
      }
    }
  }

  const chars = display.split("").map((ch, i) => (
    <span key={i} style={greens.includes(i) ? s.dollar : s.typeWhite}>{ch}</span>
  ));

  return (
    <h1 style={s.heroTitle}>
      {chars}
      <span style={s.cursor}>|</span>
    </h1>
  );
}

function ArchivesPopup({ open, onClose }) {
  if (!open) return null;
  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.archivesModal}>
        <button onClick={onClose} style={s.modalClose}>✕</button>
        <div style={s.archivesBody}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
          <div style={s.archivesTitle}>ALIEN ARCHIVES</div>
          <div style={s.archivesTag}>COMING SOON</div>
          <p style={s.archivesText}>Trump still has to unleash the alien files...</p>
          <p style={s.archivesSubtext}>ET is patient. the truth is heavy. it takes time to put down.</p>
        </div>
      </div>
    </div>
  );
}

function ChatWidget() {
  const [open, setOpen] = useState(false);
  return (
    <div style={s.chatWidgetWrap}>
      {open && (
        <div style={s.chatBubble}>
          <div style={s.chatBubbleHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={s.chatAvatar}>
                <img src="https://pbs.twimg.com/profile_images/2027519695830544384/mStpGTbc_400x400.jpg" alt="ET" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
              </div>
              <div>
                <div style={s.chatName}>ET <span style={{ color: "#00ff64", fontSize: 12 }}>✓</span></div>
                <div style={s.chatHandle}>@etalienx</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={s.chatCloseBtn}>✕</button>
          </div>
          <div style={s.chatBody}>
            <div style={s.chatMsg}>
              <div style={s.chatMsgBubble}>someone called $ET a shitcoin. brother i am literally an alien trying to phone home. this is the most utility a coin has ever had</div>
              <div style={s.chatMsgTime}>♡ 4.2k · ↻ 1.8k</div>
            </div>
            <div style={s.chatMsg}>
              <div style={s.chatMsgBubble}>7 billion of you on this rock and most of you feel alone. trust me, i get it.</div>
              <div style={s.chatMsgTime}>♡ 9.1k · ↻ 3.4k</div>
            </div>
          </div>
          <a href="https://x.com/etalienx" target="_blank" rel="noopener noreferrer" style={s.chatCta}>
            TALK TO ET ON X →
          </a>
        </div>
      )}
      <button onClick={() => setOpen(!open)} style={{
        ...s.chatFab,
        ...(open ? { boxShadow: "none", border: "2px solid rgba(255,255,255,0.15)", animation: "none" } : {}),
      }}>
        {open ? "✕" : (
          <>
            <img src="https://pbs.twimg.com/profile_images/2027519695830544384/mStpGTbc_400x400.jpg" alt="ET" style={s.chatFabImg} />
            <span style={s.chatActiveDot} />
          </>
        )}
      </button>
    </div>
  );
}

function ResearchModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      style={s.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={s.modal}>
        <button onClick={onClose} style={s.modalClose}>✕</button>
        <div style={s.modalBody}>
          <div style={s.earnBadge}>HOW IT WORKS</div>
          <h2 style={s.earnTitle}>
            RESEARCH.<br />
            <span style={s.earnGreen}>GET REWARDED.</span>
          </h2>
          <div style={s.earnSteps}>
            {[
              { num: "01", title: "RUN BOINC", desc: "Install Einstein@home on your computer. Donate idle computing power to search for gravitational waves." },
              { num: "02", title: "JOIN TEAM $ET", desc: "Register with our research group. Your contributions are tracked and verified on-chain." },
              { num: "03", title: "EARN REWARDS", desc: "ET's wallet distributes rewards to contributors. Real science. Real tokens. Real purpose." },
            ].map((step, i) => (
              <div key={i} style={s.earnStep}>
                <div style={s.stepNum}>{step.num}</div>
                <div>
                  <div style={s.stepTitle}>{step.title}</div>
                  <div style={s.stepDesc}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <a href="/research" style={s.earnCta}>
            START EARNING — JOIN RESEARCH →
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ETSiteV2() {
  const [visible, setVisible] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
  }, []);

  return (
    <>
      <style>{`
        @keyframes slam {
          0% { transform: scale(1.4) translateY(-20px); opacity: 0; }
          60% { transform: scale(0.98) translateY(2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes glow-pulse {
          0%, 100% { text-shadow: 0 0 20px rgba(0,255,100,0.3); }
          50% { text-shadow: 0 0 40px rgba(0,255,100,0.6), 0 0 80px rgba(0,255,100,0.2); }
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes blink-cursor {
          0%,100% { opacity:1; } 50% { opacity:0; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes float-slow {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes active-pulse {
          0% { box-shadow: 0 0 0 0 rgba(0,255,100,0.6); }
          70% { box-shadow: 0 0 0 8px rgba(0,255,100,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,255,100,0); }
        }
        @keyframes active-breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.8; }
        }
        @keyframes orbit-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes sun-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(0,255,100,0.2), 0 0 60px rgba(0,255,100,0.1); }
          50% { box-shadow: 0 0 50px rgba(0,255,100,0.35), 0 0 90px rgba(0,255,100,0.15); }
        }
        @media (max-width: 768px) {
          .tweets-col-hide { display: none !important; }
          .lore-tweets-grid { grid-template-columns: 1fr !important; padding: 0 20px !important; }
          .banner-bg-img-mobile { object-position: 70% center !important; }
          .flywheel-grid-wrap { grid-template-columns: 1fr !important; }
          .meme-grid-wrap { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <div style={{ ...s.page, opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}>

        <ResearchModal open={showResearch} onClose={() => setShowResearch(false)} />
        <ArchivesPopup open={showArchives} onClose={() => setShowArchives(false)} />
        <ChatWidget />

        {/* ===== HERO ===== */}
        <section style={s.hero}>
          {/* Banner as full background */}
          <div style={s.bannerBg}>
            <img src="/ET_BANNER_12.png" alt="ET overlooking Earth" style={s.bannerBgImg} className="banner-bg-img-mobile" />
            <div style={s.bannerBgFade} />
          </div>

          <div style={s.heroInner}>
            {/* Ticker marquee */}
            <div style={s.marqueeWrap}>
              <div style={s.marquee}>
                {Array(8).fill("$ET · PHONE HOME · SEARCH THE SKY · EARN REWARDS · ").map((t, i) => (
                  <span key={i} style={s.marqueeText}>{t}</span>
                ))}
              </div>
            </div>

            <div style={s.heroSubWrap}>
              <TypewriterTitle />
            </div>

            <div style={s.heroContent}>
              <div style={s.badge}>OG 👽 ON SOLANA</div>

              <p style={s.heroSubBelow}>
                AN ALIEN LOST ON EARTH.<br />
                TRYING TO PHONE HOME.
              </p>

              <CopyCA />

              <div style={s.heroCtas}>
                <BuyDropdown />
                <button onClick={() => setShowResearch(true)} style={s.ctaPrimary}>
                  JOIN RESEARCH & EARN →
                </button>
                <a href="https://x.com/etalienx" target="_blank" rel="noopener noreferrer" style={s.ctaSecondary}>
                  TALK TO ET ON X
                </a>
                <a href="https://x.com/i/communities/2028185586419556603" target="_blank" rel="noopener noreferrer" style={s.ctaSecondary}>
                  JOIN COMMUNITY
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ===== LORE + TWEETS ===== */}
        <section style={s.loreAndTweetsSection}>
          <div style={s.loreAndTweetsGrid} className="lore-tweets-grid">
            {/* Left: Lore */}
            <div>
              <h2 style={s.sectionTitle}>THE LORE</h2>
              <div style={s.loreList}>
                {LORE.map((item, i) => (
                  <div key={i} style={s.loreItem}>
                    <div style={s.loreTag}>{item.tag}</div>
                    <div style={s.loreText}>
                      {item.link ? (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" style={s.loreLink}>{item.text} ↗</a>
                      ) : item.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Featured Tweet */}
            <div className="tweets-col-hide">
              <a href="https://x.com/etalienx/status/2028922412348166357" target="_blank" rel="noopener noreferrer" style={s.tweetShowCard}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,100,0.2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
              >
                <div style={s.tweetShowHeader}>
                  <img src="https://pbs.twimg.com/profile_images/2027519695830544384/mStpGTbc_400x400.jpg" alt="ET" style={s.tweetShowAvatar} />
                  <div>
                    <span style={s.tweetShowName}>ET </span>
                    <span style={s.tweetShowVerified}>✓</span>
                    <br />
                    <span style={s.tweetShowHandle}>@etalienx</span>
                  </div>
                </div>
                <p style={s.tweetShowBody}>your cells replace themselves every 7-10 years which means none of the matter that crashed here is still in this body. i'm literally a different pile of atoms missing the same home.</p>
                <img src="/et-tweet-img.png" alt="ET art" style={s.tweetShowImage} />
                <div style={s.tweetShowMeta}>
                  <span style={s.tweetShowStat}>♡ 2.1k</span>
                  <span style={s.tweetShowStat}>↻ 847</span>
                </div>
              </a>
            </div>
          </div>
        </section>

        {/* ===== FLYWHEEL ===== */}
        <section style={s.flywheelSection}>
          <div style={s.flywheelFull}>
            <h2 style={s.sectionTitle}>THE FLYWHEEL</h2>
            <p style={s.flywheelSub}>no roadmap. no end state. just a machine that accelerates.</p>
            <div style={s.flywheelGrid} className="flywheel-grid-wrap">
              {/* Left: Orbit */}
              <div style={s.flywheelWrap}>
                <div style={s.orbitContainer}>
                {/* Orbit rings */}
                <div style={s.orbitRing1} />
                <div style={s.orbitRing2} />

                {/* Sun - center */}
                <div style={s.flywheelSun}>
                  <span style={s.flywheelSunText}>$ET</span>
                </div>

                {/* Rotating planets */}
                <div style={s.orbitTrack}>
                  {[
                    { emoji: "🧠", label: "Pre-Bond\nET on X", angle: 0 },
                    { emoji: "🧃", label: "30K MC\nJuice On", angle: 72 },
                    { emoji: "👛", label: "After Bond\nET Wallet", angle: 144 },
                    { emoji: "🏆", label: "1M Volume\nRewards", angle: 216 },
                    { emoji: "👽", label: "500K MC\nBuild Cult", angle: 288 },
                  ].map((node, i) => {
                    const rad = (node.angle * Math.PI) / 180;
                    const radius = 42;
                    const x = 50 + radius * Math.cos(rad);
                    const y = 50 + radius * Math.sin(rad);
                    return (
                      <div key={i} style={{
                        ...s.planetNode,
                        left: `${x}%`,
                        top: `${y}%`,
                      }}>
                        <div style={s.planetEmoji}>{node.emoji}</div>
                        <div style={s.planetLabel}>{node.label}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Arrow indicators on ring */}
                {[0, 72, 144, 216, 288].map((angle, i) => {
                  const midAngle = angle + 36;
                  const rad = (midAngle * Math.PI) / 180;
                  const radius = 42;
                  const x = 50 + radius * Math.cos(rad);
                  const y = 50 + radius * Math.sin(rad);
                  return (
                    <div key={i} style={{
                      position: "absolute",
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: `translate(-50%, -50%) rotate(${midAngle + 90}deg)`,
                      color: "rgba(0,255,100,0.3)",
                      fontSize: 14,
                      fontFamily: "sans-serif",
                      zIndex: 1,
                    }}>›</div>
                  );
                })}
              </div>
            </div>

              {/* Right: Steps list */}
              <div style={s.flywheelSteps}>
                {[
                  { num: "PRE-BOND", emoji: "🧠", title: "SELF-AWARE ET ON X", desc: "Fully autonomous AI persona. No human in the loop." },
                  { num: "30K MC", emoji: "🧃", title: "JUICE FLYWHEEL ACTIVATED", desc: "Buyback and burn turns on." },
                  { num: "AFTER BOND", emoji: "👛", title: "ET'S OWN WALLET", desc: "Rewards humans for completing micro tasks." },
                  { num: "1M VOLUME", emoji: "🏆", title: "CREATOR REWARDS", desc: "Earn for BOINC research, content, growing the mission." },
                  { num: "500K MC", emoji: "👽", title: "BUILD THE CULT", desc: "ET PFPs. Meme army. The flywheel spins faster." },
                ].map((step, i) => (
                  <div key={i} style={s.flywheelStep}>
                    <div style={s.flywheelStepNum}>{step.num}</div>
                    <div style={s.flywheelStepEmoji}>{step.emoji}</div>
                    <div>
                      <div style={s.flywheelStepTitle}>{step.title}</div>
                      <div style={s.flywheelStepDesc}>{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== MEME GALLERY ===== */}
        <section style={s.memeSection}>
          <div style={s.memeInner}>
            <h2 style={s.sectionTitle}>MEME TRANSMISSIONS</h2>
            <p style={s.memeSub}>dispatches from an alien among you · <a href="https://memedepot.com/d/et" target="_blank" rel="noopener noreferrer" style={{ color: "#00ff64", borderBottom: "1px dashed rgba(0,255,100,0.4)" }}>submit on memedepot ↗</a></p>
            <MemeGallery />
          </div>
        </section>

        {/* ===== LINKS ===== */}
        <section style={s.linksSection}>
          <div style={s.linksInner}>
            <h2 style={s.sectionTitle}>LINKS</h2>
            <div style={s.linksGrid}>
              {LINKS.map((link, i) =>
                link.soon ? (
                  <button
                    key={i}
                    onClick={() => setShowArchives(true)}
                    style={s.linkPill}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(0,255,100,0.08)";
                      e.currentTarget.style.transform = "scale(1.04)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <span>{link.emoji}</span>
                    <span>{link.label}</span>
                    <span style={s.soonTag}>SOON</span>
                  </button>
                ) : (
                <a
                  key={i}
                  href={link.url}
                  target={link.url.startsWith("http") ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  style={s.linkPill}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#00ff64";
                    e.currentTarget.style.color = "#000";
                    e.currentTarget.style.transform = "scale(1.04)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.color = "#fff";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <span>{link.emoji}</span>
                  <span>{link.label}</span>
                </a>
                )
              )}
            </div>
          </div>
        </section>

        {/* ===== FOOTER ===== */}
        <footer style={s.footer}>
          <div style={s.footerTitle}>HELP ET PHONE HOME.</div>
          <div style={s.footerSub}>distributed science · solana · community owned</div>
        </footer>

      </div>
    </>
  );
}

const s = {
  page: {
    fontFamily: "'DM Mono', monospace",
    color: "#fff",
    background: "#050508",
    minHeight: "100vh",
  },

  // HERO
  hero: {
    background: "#0a0f12",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    overflow: "visible",
    position: "relative",
    zIndex: 10,
  },
  heroInner: {
    maxWidth: "inherit",
    margin: "0 auto",
    position: "relative",
    overflow: "visible",
    zIndex: 2,
  },
  marqueeWrap: {
    overflow: "hidden",
    borderBottom: "1px solid rgba(0,255,100,0.15)",
    padding: "10px 0",
    background: "rgba(0,255,100,0.03)",
    position: "relative",
    zIndex: 2,
  },
  marquee: {
    display: "flex",
    whiteSpace: "nowrap",
    animation: "marquee 25s linear infinite",
    width: "fit-content",
  },
  marqueeText: {
    fontSize: 11,
    letterSpacing: "3px",
    color: "rgba(0,255,100,0.6)",
    fontFamily: "'DM Mono', monospace",
    fontWeight: 500,
    padding: "0 4px",
  },
  heroContent: {
    padding: "24px 20px 80px",
    textAlign: "center",
    position: "relative",
    overflow: "visible",
    zIndex: 2,
  },
  // BANNER BACKGROUND
  bannerBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    zIndex: 0,
  },
  bannerBgImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center 20%",
    display: "block",
  },
  bannerBgFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "60%",
    background: "linear-gradient(to top, #0a0f12 0%, rgba(10,15,18,0.85) 40%, transparent 100%)",
    pointerEvents: "none",
  },
  heroSubWrap: {
    textAlign: "center",
    padding: "clamp(120px, 30vw, 280px) 20px 24px",
    position: "relative",
    zIndex: 2,
  },
  heroSub: {
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: "clamp(18px, 4.5vw, 32px)",
    lineHeight: 1.4,
    color: "rgba(255,255,255,0.8)",
    letterSpacing: "3px",
    margin: 0,
    textShadow: "0 2px 30px rgba(0,0,0,0.9), 0 4px 60px rgba(0,0,0,0.5)",
  },
  heroSubBelow: {
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: "clamp(14px, 3.5vw, 20px)",
    lineHeight: 1.4,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: "2px",
    marginBottom: 24,
  },
  badge: {
    display: "inline-block",
    fontSize: 11,
    letterSpacing: "3px",
    color: "#00ff64",
    border: "1px solid rgba(0,255,100,0.3)",
    borderRadius: 100,
    padding: "6px 18px",
    marginBottom: 28,
    fontWeight: 500,
  },
  // TITLE
  heroTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "clamp(16px, 4vw, 56px)",
    lineHeight: 1.3,
    letterSpacing: "clamp(0px, 0.3vw, 2px)",
    marginBottom: 0,
    color: "#fff",
    textAlign: "center",
    whiteSpace: "normal",
    wordBreak: "keep-all",
    minHeight: "1.3em",
    fontWeight: 800,
    textTransform: "uppercase",
    textShadow: "0 2px 30px rgba(0,0,0,0.9), 0 4px 60px rgba(0,0,0,0.5)",
    padding: "0 20px",
  },
  typeWhite: {
    color: "#fff",
  },
  dollar: {
    color: "#00ff64",
    animation: "glow-pulse 3s ease-in-out infinite",
    fontSize: "inherit",
    fontFamily: "inherit",
    fontWeight: "inherit",
    lineHeight: "inherit",
  },
  cursor: {
    color: "#00ff64",
    animation: "blink-cursor 0.8s step-end infinite",
    fontWeight: 100,
    marginLeft: 2,
  },

  // CA
  caWrap: {
    marginBottom: 32,
  },
  caLabel: {
    fontSize: 10,
    letterSpacing: "4px",
    color: "rgba(255,255,255,0.25)",
    marginBottom: 8,
    fontWeight: 500,
  },
  caBox: {
    display: "inline-flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    background: "rgba(0,255,100,0.04)",
    border: "1px solid rgba(0,255,100,0.15)",
    borderRadius: 10,
    cursor: "pointer",
    transition: "all 0.2s",
    maxWidth: "100%",
  },
  caCode: {
    fontSize: "clamp(9px, 2.2vw, 12px)",
    color: "#00ff64",
    wordBreak: "break-all",
    fontFamily: "'DM Mono', monospace",
    textAlign: "center",
    lineHeight: 1.5,
  },
  caCopyIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(0,255,100,0.5)",
    flexShrink: 0,
    transition: "color 0.2s",
  },

  // BUY DROPDOWN
  buyWrap: {
    position: "relative",
    width: "100%",
    zIndex: 50,
  },
  buyBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px 24px",
    background: "#00ff64",
    color: "#000",
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 16,
    letterSpacing: "1px",
    borderRadius: 10,
    textAlign: "center",
    fontWeight: 900,
    transition: "all 0.2s",
    boxShadow: "0 0 30px rgba(0,255,100,0.25)",
    border: "none",
    cursor: "pointer",
  },
  buyDropdown: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    background: "#111118",
    border: "1px solid rgba(0,255,100,0.15)",
    borderRadius: 12,
    overflow: "hidden",
    zIndex: 100,
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
    animation: "rise 0.2s ease-out",
  },
  buyOption: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 18px",
    color: "#fff",
    fontSize: 14,
    fontFamily: "'DM Mono', monospace",
    textDecoration: "none",
    transition: "background 0.15s",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },

  // CTAs
  heroCtas: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "center",
    maxWidth: 340,
    margin: "0 auto",
    overflow: "visible",
    position: "relative",
    zIndex: 20,
  },
  ctaPrimary: {
    width: "100%",
    display: "block",
    padding: "16px 24px",
    background: "#00ff64",
    color: "#000",
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 15,
    letterSpacing: "1px",
    borderRadius: 10,
    textAlign: "center",
    fontWeight: 900,
    transition: "all 0.2s",
    boxShadow: "0 0 30px rgba(0,255,100,0.25)",
    border: "none",
    cursor: "pointer",
  },
  ctaSecondary: {
    width: "100%",
    display: "block",
    padding: "14px 24px",
    background: "transparent",
    color: "rgba(255,255,255,0.6)",
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 13,
    letterSpacing: "1px",
    borderRadius: 10,
    textAlign: "center",
    border: "1px solid rgba(255,255,255,0.12)",
    transition: "all 0.2s",
  },

  // EARN (modal content)
  earnSection: {
    background: "linear-gradient(180deg, #0a0f12 0%, #060a0d 100%)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  earnInner: {
    maxWidth: 700,
    margin: "0 auto",
    padding: "64px 20px",
  },
  earnBadge: {
    fontSize: 10,
    letterSpacing: "4px",
    color: "#00ff64",
    marginBottom: 16,
    fontWeight: 700,
  },
  earnTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "clamp(28px, 7vw, 48px)",
    lineHeight: 1,
    letterSpacing: "1px",
    marginBottom: 40,
    color: "#fff",
    fontWeight: 800,
    textTransform: "uppercase",
  },
  earnGreen: {
    color: "#00ff64",
    animation: "glow-pulse 3s ease-in-out infinite",
  },
  earnSteps: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    marginBottom: 36,
  },
  earnStep: {
    display: "flex",
    gap: 18,
    alignItems: "flex-start",
    padding: "20px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 12,
  },
  stepNum: {
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 28,
    color: "rgba(0,255,100,0.2)",
    lineHeight: 1,
    flexShrink: 0,
    width: 48,
  },
  stepTitle: {
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 16,
    letterSpacing: "1px",
    marginBottom: 6,
    color: "#fff",
  },
  stepDesc: {
    fontSize: 13,
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.5)",
  },
  earnCta: {
    display: "inline-block",
    padding: "14px 28px",
    background: "rgba(0,255,100,0.1)",
    border: "1px solid rgba(0,255,100,0.3)",
    borderRadius: 10,
    color: "#00ff64",
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 13,
    letterSpacing: "1px",
    transition: "all 0.2s",
  },

  // LORE
  // LORE + TWEETS
  loreAndTweetsSection: {
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    padding: "64px 40px",
  },
  loreAndTweetsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 40,
    maxWidth: 1200,
    margin: "0 auto",
    alignItems: "center",
  },
  sectionTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "clamp(24px, 6vw, 38px)",
    letterSpacing: "2px",
    marginBottom: 32,
    color: "#fff",
    fontWeight: 800,
    textTransform: "uppercase",
  },
  loreList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  loreItem: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderLeft: "3px solid rgba(0,255,100,0.3)",
    background: "rgba(255,255,255,0.015)",
    borderRadius: "0 8px 8px 0",
  },
  loreTag: {
    fontSize: 16,
    width: 32,
    textAlign: "center",
    flexShrink: 0,
  },
  loreText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 1.5,
  },
  loreLink: {
    color: "#00ff64",
    borderBottom: "1px dashed rgba(0,255,100,0.4)",
  },
  tweetsCol: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  tweetShowCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: "20px",
    transition: "border-color 0.2s",
    textDecoration: "none",
    display: "block",
    cursor: "pointer",
  },
  tweetShowHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  tweetShowAvatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    objectFit: "cover",
    border: "1px solid rgba(0,255,100,0.15)",
  },
  tweetShowName: {
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 14,
    color: "#fff",
  },
  tweetShowVerified: {
    color: "#00ff64",
    fontSize: 12,
  },
  tweetShowHandle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
    fontFamily: "'DM Mono', monospace",
  },
  tweetShowBody: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.75)",
    marginBottom: 14,
  },
  tweetShowImage: {
    width: "100%",
    borderRadius: 12,
    marginBottom: 14,
    border: "1px solid rgba(255,255,255,0.06)",
    display: "block",
  },
  tweetShowMeta: {
    display: "flex",
    gap: 20,
  },
  tweetShowStat: {
    fontSize: 12,
    color: "rgba(255,255,255,0.2)",
    fontFamily: "'DM Mono', monospace",
  },
  // FLYWHEEL
  flywheelSection: {
    background: "linear-gradient(180deg, #060a0d 0%, #08080e 100%)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  flywheelFull: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "64px 40px",
  },
  flywheelSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.3)",
    marginTop: -20,
    marginBottom: 40,
    letterSpacing: "1px",
  },
  flywheelGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 40,
    alignItems: "center",
  },
  flywheelWrap: {
    display: "flex",
    justifyContent: "flex-start",
  },
  orbitContainer: {
    position: "relative",
    width: "min(100%, 400px)",
    aspectRatio: "1",
  },
  orbitRing1: {
    position: "absolute",
    top: "8%", left: "8%", right: "8%", bottom: "8%",
    borderRadius: "50%",
    border: "1px solid rgba(0,255,100,0.08)",
  },
  orbitRing2: {
    position: "absolute",
    top: "20%", left: "20%", right: "20%", bottom: "20%",
    borderRadius: "50%",
    border: "1px dashed rgba(0,255,100,0.06)",
  },
  flywheelSun: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 80,
    height: 80,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(0,255,100,0.15) 0%, rgba(0,255,100,0.03) 70%, transparent 100%)",
    border: "2px solid rgba(0,255,100,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
    animation: "sun-glow 3s ease-in-out infinite",
  },
  flywheelSunText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 22,
    color: "#00ff64",
    letterSpacing: "1px",
    fontWeight: 800,
  },
  orbitTrack: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    animation: "orbit-spin 30s linear infinite",
  },
  planetNode: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    zIndex: 3,
  },
  planetEmoji: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "rgba(0,255,100,0.06)",
    border: "1px solid rgba(0,255,100,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    animation: "orbit-spin 30s linear infinite reverse",
  },
  planetLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    fontFamily: "'DM Mono', monospace",
    letterSpacing: "0.5px",
    lineHeight: 1.3,
    whiteSpace: "pre-line",
    animation: "orbit-spin 30s linear infinite reverse",
  },
  flywheelSteps: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  flywheelStep: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    background: "rgba(255,255,255,0.015)",
    border: "1px solid rgba(255,255,255,0.04)",
    borderRadius: 10,
  },
  flywheelStepNum: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 9,
    color: "#00ff64",
    width: 64,
    flexShrink: 0,
    textAlign: "center",
    letterSpacing: "1px",
    fontWeight: 700,
    lineHeight: 1.2,
  },
  flywheelStepEmoji: {
    fontSize: 20,
    width: 28,
    textAlign: "center",
    flexShrink: 0,
  },
  flywheelStepTitle: {
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 13,
    letterSpacing: "1px",
    color: "#fff",
    marginBottom: 2,
  },
  flywheelStepDesc: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "rgba(255,255,255,0.4)",
  },

  // MEMES
  memeSection: {
    background: "linear-gradient(180deg, #060a0d 0%, #08080e 100%)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  memeInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "64px 20px",
  },
  memeSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.3)",
    marginTop: -20,
    marginBottom: 32,
    letterSpacing: "1px",
  },
  memeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
  },
  memeCard: {
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.06)",
    cursor: "pointer",
    transition: "all 0.25s ease",
    aspectRatio: "1",
    position: "relative",
    background: "#0a0a14",
  },
  memeImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    transition: "transform 0.3s ease",
    cursor: "pointer",
  },
  shareXBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.7)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
    opacity: 0.6,
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    zIndex: 2,
  },

  // LIGHTBOX
  lightbox: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.92)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    zIndex: 10001,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    cursor: "pointer",
    animation: "rise 0.25s ease-out",
  },
  lightboxClose: {
    position: "absolute",
    top: 20,
    right: 20,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "#fff",
    width: 40,
    height: 40,
    borderRadius: "50%",
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "sans-serif",
    zIndex: 1,
  },
  lightboxImg: {
    maxWidth: "90vw",
    maxHeight: "85vh",
    objectFit: "contain",
    borderRadius: 12,
    boxShadow: "0 0 60px rgba(0,0,0,0.5)",
  },
  expandBtn: {
    display: "block",
    margin: "20px auto 0",
    padding: "12px 28px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 100,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 12,
    letterSpacing: "2px",
    cursor: "pointer",
    transition: "all 0.2s",
  },

  // SHARE POPUP
  shareOverlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.88)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    zIndex: 10002,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    animation: "rise 0.25s ease-out",
  },
  shareModal: {
    background: "linear-gradient(180deg, #0d1218 0%, #080b10 100%)",
    border: "1px solid rgba(0,255,100,0.12)",
    borderRadius: 16,
    padding: "20px",
    maxWidth: 400,
    width: "100%",
    textAlign: "center",
    boxShadow: "0 0 60px rgba(0,255,100,0.08), 0 20px 60px rgba(0,0,0,0.6)",
    position: "relative",
    maxHeight: "90vh",
    overflowY: "auto",
  },
  shareCloseBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.5)",
    width: 32,
    height: 32,
    borderRadius: "50%",
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "sans-serif",
    zIndex: 1,
  },
  sharePreviewImg: {
    width: "100%",
    borderRadius: 12,
    marginBottom: 16,
    border: "1px solid rgba(255,255,255,0.06)",
    display: "block",
  },
  shareActions: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
  },
  shareCopyBtn: {
    flex: 1,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    color: "#fff",
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 12,
    letterSpacing: "1px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  shareDownloadBtn: {
    flex: 1,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    color: "#fff",
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 12,
    letterSpacing: "1px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  shareCta: {
    width: "100%",
    padding: "14px 24px",
    background: "#00ff64",
    color: "#000",
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 13,
    letterSpacing: "1px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: 900,
    transition: "all 0.2s",
  },

  // TWEET OPTIONS
  tweetOptionsWrap: {
    marginBottom: 12,
    textAlign: "left",
  },
  tweetOptionsLabel: {
    fontSize: 10,
    color: "rgba(0,255,100,0.5)",
    letterSpacing: "2px",
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 8,
  },
  tweetOptionsLoading: {
    fontSize: 13,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    padding: "16px 0",
    fontFamily: "'DM Mono', monospace",
  },
  tweetOptionsList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 180,
    overflowY: "auto",
  },
  tweetOption: {
    textAlign: "left",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    lineHeight: 1.4,
    cursor: "pointer",
    fontFamily: "'DM Mono', monospace",
    transition: "all 0.15s",
  },
  tweetOptionSelected: {
    borderColor: "#00ff64",
    background: "rgba(0,255,100,0.06)",
    color: "#fff",
  },

  // ARCHIVES POPUP
  archivesModal: {
    position: "relative",
    background: "linear-gradient(180deg, #0d1218 0%, #080b10 100%)",
    border: "1px solid rgba(0,255,100,0.12)",
    borderRadius: 16,
    maxWidth: 420,
    width: "100%",
    boxShadow: "0 0 60px rgba(0,255,100,0.08), 0 20px 60px rgba(0,0,0,0.6)",
    textAlign: "center",
  },
  archivesBody: {
    padding: "48px 32px 40px",
  },
  archivesTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 22,
    color: "#fff",
    letterSpacing: "2px",
    marginBottom: 8,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  archivesTag: {
    display: "inline-block",
    fontSize: 10,
    letterSpacing: "3px",
    color: "#00ff64",
    border: "1px solid rgba(0,255,100,0.3)",
    borderRadius: 100,
    padding: "4px 14px",
    marginBottom: 24,
    fontWeight: 700,
  },
  archivesText: {
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    lineHeight: 1.5,
    marginBottom: 12,
  },
  archivesSubtext: {
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
    fontStyle: "italic",
    lineHeight: 1.5,
  },

  // CHAT WIDGET
  chatWidgetWrap: {
    position: "fixed",
    bottom: 24,
    right: 24,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 12,
  },
  chatFab: {
    width: 60,
    height: 60,
    borderRadius: "50%",
    background: "#111118",
    border: "2px solid rgba(0,255,100,0.25)",
    cursor: "pointer",
    fontSize: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 0 20px rgba(0,255,100,0.15)",
    transition: "all 0.2s",
    color: "#fff",
    fontFamily: "sans-serif",
    position: "relative",
    overflow: "visible",
    padding: 0,
    animation: "active-pulse 2s ease-in-out infinite",
  },
  chatFabImg: {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    objectFit: "cover",
    display: "block",
  },
  chatActiveDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#00ff64",
    border: "2px solid #111118",
    animation: "active-breathe 2s ease-in-out infinite",
  },
  chatBubble: {
    width: 320,
    maxHeight: 420,
    background: "#111118",
    border: "1px solid rgba(0,255,100,0.12)",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 12px 48px rgba(0,0,0,0.6), 0 0 40px rgba(0,255,100,0.06)",
    animation: "rise 0.25s ease-out",
    display: "flex",
    flexDirection: "column",
  },
  chatBubbleHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 16px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  chatAvatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "rgba(0,255,100,0.1)",
    border: "2px solid rgba(0,255,100,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    flexShrink: 0,
  },
  chatName: {
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 14,
    color: "#fff",
  },
  chatHandle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    fontFamily: "'DM Mono', monospace",
  },
  chatCloseBtn: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.4)",
    fontSize: 16,
    cursor: "pointer",
    padding: 4,
    fontFamily: "sans-serif",
  },
  chatBody: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  chatMsg: {},
  chatMsgBubble: {
    background: "rgba(0,255,100,0.06)",
    border: "1px solid rgba(0,255,100,0.1)",
    borderRadius: "14px 14px 14px 4px",
    padding: "12px 14px",
    fontSize: 13,
    lineHeight: 1.5,
    color: "rgba(255,255,255,0.8)",
  },
  chatMsgTime: {
    fontSize: 10,
    color: "rgba(255,255,255,0.2)",
    marginTop: 4,
    paddingLeft: 4,
    fontFamily: "'DM Mono', monospace",
  },
  chatCta: {
    display: "block",
    textAlign: "center",
    padding: "14px",
    background: "#00ff64",
    color: "#000",
    fontFamily: "'Archivo Black', sans-serif",
    fontSize: 13,
    letterSpacing: "1px",
    textDecoration: "none",
    transition: "all 0.2s",
  },

  // LINKS
  linksSection: {
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  linksInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "64px 20px",
  },
  linksGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  linkPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 18px",
    background: "rgba(255,255,255,0.05)",
    borderRadius: 100,
    fontSize: 13,
    fontWeight: 500,
    color: "#fff",
    transition: "all 0.2s ease",
    cursor: "pointer",
    position: "relative",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  soonTag: {
    fontSize: 8,
    letterSpacing: "2px",
    color: "rgba(0,255,100,0.5)",
    background: "rgba(0,255,100,0.08)",
    padding: "2px 6px",
    borderRadius: 4,
  },

  // MODAL
  overlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.85)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    zIndex: 10000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    animation: "rise 0.3s ease-out",
  },
  modal: {
    position: "relative",
    background: "linear-gradient(180deg, #0d1218 0%, #080b10 100%)",
    border: "1px solid rgba(0,255,100,0.12)",
    borderRadius: 16,
    maxWidth: 600,
    width: "100%",
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 0 60px rgba(0,255,100,0.08), 0 20px 60px rgba(0,0,0,0.6)",
  },
  modalClose: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.5)",
    width: 36,
    height: 36,
    borderRadius: "50%",
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
    zIndex: 1,
    fontFamily: "sans-serif",
  },
  modalBody: {
    padding: "48px 28px 40px",
  },

  // FOOTER
  footer: {
    textAlign: "center",
    padding: "48px 20px",
  },
  footerTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "clamp(20px, 5vw, 32px)",
    color: "rgba(255,255,255,0.6)",
    letterSpacing: "2px",
    marginBottom: 8,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  footerSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: "2px",
  },
};
