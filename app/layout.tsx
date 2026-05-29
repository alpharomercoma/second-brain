import type { Metadata } from 'next';
import { Fraunces, Newsreader, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Display: an expressive, optically-sized serif for the wordmark + big moments.
const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  style: ['normal', 'italic'],
  display: 'swap',
});

// Body: a refined text serif — documents read like a manuscript.
const body = Newsreader({
  subsets: ['latin'],
  variable: '--font-body',
  style: ['normal', 'italic'],
  display: 'swap',
});

// Mono: the "instrument" face for paths, labels, and the agent's step trace.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Atelier — an idea studio',
  description:
    'Generate new ideas grounded in your own body of work. A writing studio powered by Qwen on Runpod.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="grain" aria-hidden />
        {children}
      </body>
    </html>
  );
}
