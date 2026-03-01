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
      {children}
    </>
  );
}
