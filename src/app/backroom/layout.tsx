export default function BackroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Silkscreen:wght@400;700&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .gate-notice-list li::before { content: "✕ "; color: #ff3c3c; font-size: 8px; }
        @media (max-width: 768px) {
          .backroom-sidebar { position: fixed !important; top: 49px !important; right: 0 !important; bottom: 0 !important; z-index: 50 !important; transform: translateX(100%) !important; }
          .backroom-sidebar.open { transform: translateX(0) !important; }
        }
      `}</style>
      {children}
    </>
  );
}
