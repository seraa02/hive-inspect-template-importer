import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hive Inspect - Template Importer",
  description: "Import, edit, and manage inspection templates migrated from Spectora.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight text-lg">
              Hive Inspect <span className="text-neutral-400 font-normal">/ Template Importer</span>
            </Link>
            <Link
              href="/import"
              className="text-sm font-medium bg-neutral-900 text-white px-3 py-1.5 rounded-md hover:bg-neutral-700"
            >
              Import Spectora template
            </Link>
          </div>
        </header>
        <main className="flex-1 mx-auto max-w-5xl w-full px-6 py-8">{children}</main>
        <footer className="border-t border-neutral-200 py-4 text-center text-xs text-neutral-400">
          Forward Deployed Engineer take-home &middot; Template migration workflow
        </footer>
      </body>
    </html>
  );
}
