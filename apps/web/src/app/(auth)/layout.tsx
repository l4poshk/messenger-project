// ──────────────────────────────────────────────
// Auth layout — shared wrapper for /login and /register
// Centered card on gradient background
// ──────────────────────────────────────────────

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-tertiary p-4">
      {/* Subtle gradient glow behind the card */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-[420px] animate-slide-up">
        {children}
      </div>
    </div>
  );
}
