import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

// UI + body + markdown: a geometric sans — clean, readable, professional, with
// the engineered character of Nebius's custom typeface.
const sans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// Labels, file paths, the agent's tool trace, and code — the "instrument" face.
const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Second Brain — an idea studio',
  description:
    'A second brain for brainstorming new ideas, projects, and talks — grounded in your own body of work. Powered by Mistral AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <div className="grain" aria-hidden />
        {children}
      </body>
    </html>
  );
}
