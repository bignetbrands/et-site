// @ts-nocheck
"use client";
import { useState, useEffect, useCallback } from "react";

interface MemeImage {
  url: string;
  id: string;
  index: number;
  thumbnailUrl: string;
}

function extractId(url: string): string {
  const m = url.match(/imagedelivery\/[a-zA-Z0-9_-]+\/([a-zA-Z0-9_-]+)\//);
  return m ? m[1] : url;
}

function toThumbnail(url: string): string {
  return url.replace(/width=\d+/, "width=400");
}

export default function MemesPage() {
  const [memes, setMemes] = useState<MemeImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<MemeImage | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/api/memes")
      .then(r => r.json())
      .then(data => {
        const images: MemeImage[] = (data.images || []).map((url: string, i: number) => ({
          url,
          id: extractId(url),
          index: i + 1,
          thumbnailUrl: toThumbnail(url),
        }));
        setMemes(images);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load meme library");
        setLoading(false);
      });
  }, []);

  const copyToClipboard = useCallback(async (meme: MemeImage, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await fetch(meme.thumbnailUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      setCopied(meme.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback: copy URL
      await navigator.clipboard.writeText(meme.url);
      setCopied(meme.id + "_url");
      setTimeout(() => setCopied(null), 2000);
    }
  }, []);

  const filtered = filter.trim()
    ? memes.filter(m => m.id.toLowerCase().includes(filter.toLowerCase()) || String(m.index).includes(filter))
    : memes;

  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#fff", fontFamily: "monospace" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(57,255,20,0.1)", padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "rgba(57,255,20,0.5)", letterSpacing: "3px", marginBottom: "4px" }}>ET MEME LIBRARY</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff" }}>👽 Meme Archive</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
            {loading ? "Loading..." : `${memes.length} images • pulled from memedepot.com/d/et`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="search by index or ID..."
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(57,255,20,0.15)", borderRadius: "4px", padding: "6px 12px", color: "#fff", fontFamily: "monospace", fontSize: "11px", width: "200px", outline: "none" }}
          />
          <a href="https://memedepot.com/d/et" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: "10px", color: "rgba(57,255,20,0.5)", border: "1px solid rgba(57,255,20,0.15)", borderRadius: "4px", padding: "6px 12px", textDecoration: "none" }}>
            ↗ MEMEDEPOT
          </a>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: "24px 32px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "60px", color: "rgba(57,255,20,0.4)", letterSpacing: "2px", fontSize: "11px" }}>
            SCANNING MEME ARCHIVE...
          </div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: "60px", color: "rgba(255,80,80,0.6)", fontSize: "12px" }}>{error}</div>
        )}
        {!loading && !error && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}>
            {filtered.map(meme => (
              <div
                key={meme.id}
                onClick={() => setSelected(meme)}
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s", position: "relative" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(57,255,20,0.3)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}
              >
                {/* Image */}
                <div style={{ width: "100%", aspectRatio: "1", overflow: "hidden", background: "rgba(0,0,0,0.3)" }}>
                  <img
                    src={meme.thumbnailUrl}
                    alt={`ET meme #${meme.index}`}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </div>

                {/* Metadata */}
                <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "rgba(57,255,20,0.7)" }}>#{meme.index}</span>
                    <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)", letterSpacing: "1px" }}>ET MEME</span>
                  </div>
                  <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", marginBottom: "8px", wordBreak: "break-all" }}>
                    {meme.id.slice(0, 18)}...
                  </div>
                  <button
                    onClick={e => copyToClipboard(meme, e)}
                    style={{
                      width: "100%",
                      background: copied === meme.id ? "rgba(57,255,20,0.15)" : copied === meme.id + "_url" ? "rgba(255,200,0,0.1)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${copied?.startsWith(meme.id) ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: "3px",
                      color: copied === meme.id ? "rgba(57,255,20,0.9)" : copied === meme.id + "_url" ? "rgba(255,200,0,0.8)" : "rgba(255,255,255,0.5)",
                      fontFamily: "monospace",
                      fontSize: "9px",
                      letterSpacing: "1px",
                      padding: "5px",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {copied === meme.id ? "✓ COPIED IMAGE" : copied === meme.id + "_url" ? "✓ COPIED URL" : "⎘ COPY IMAGE"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#0a0a0f", border: "1px solid rgba(57,255,20,0.2)", borderRadius: "8px", overflow: "hidden", maxWidth: "600px", width: "100%" }}
          >
            <img src={selected.thumbnailUrl} alt={`ET meme #${selected.index}`} style={{ width: "100%", display: "block" }} />
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "rgba(57,255,20,0.8)", marginBottom: "4px" }}>ET Meme #{selected.index}</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>ID: {selected.id}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "3px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace", fontSize: "11px", padding: "4px 10px", cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)", wordBreak: "break-all", marginBottom: "12px", background: "rgba(0,0,0,0.3)", padding: "8px", borderRadius: "3px" }}>
                {selected.url}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => copyToClipboard(selected)}
                  style={{ flex: 1, background: copied?.startsWith(selected.id) ? "rgba(57,255,20,0.15)" : "rgba(57,255,20,0.08)", border: "1px solid rgba(57,255,20,0.3)", borderRadius: "4px", color: "rgba(57,255,20,0.8)", fontFamily: "monospace", fontSize: "10px", letterSpacing: "1px", padding: "8px", cursor: "pointer" }}
                >
                  {copied?.startsWith(selected.id) ? "✓ COPIED" : "⎘ COPY IMAGE"}
                </button>
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "rgba(255,255,255,0.5)", fontFamily: "monospace", fontSize: "10px", letterSpacing: "1px", padding: "8px", cursor: "pointer", textDecoration: "none", textAlign: "center", display: "block" }}
                >
                  ↗ OPEN FULL SIZE
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
