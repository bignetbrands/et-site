export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style>{`* { margin: 0; padding: 0; box-sizing: border-box; } html, body { background: #020802; }`}</style>
      </head>
      <body style={{ margin: 0, padding: 0, background: '#020802' }}>{children}</body>
    </html>
  );
}
