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
    <html lang="en" className="dark">
      <body className="bg-primary text-primary">{children}</body>
    </html>
  );
}
