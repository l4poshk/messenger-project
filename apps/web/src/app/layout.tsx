import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Messenger',
  description: 'Real-time messenger application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Apply persisted theme before first paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const stored = JSON.parse(localStorage.getItem('messenger-ui') || '{}');
                const theme = stored?.state?.theme || 'dark';
                document.documentElement.className = theme;
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
