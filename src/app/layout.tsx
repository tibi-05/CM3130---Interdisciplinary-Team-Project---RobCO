import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Header } from "@/components/Header";
import { LAB } from "@/lib/config";
import "./globals.css";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["400", "600", "800"] });

export const metadata: Metadata = {
  title: LAB.name,
  description: "See which robots and devices are free, book them, and check them out.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Header />
        <main className="flex-1 pb-16">{children}</main>
        <footer className="bg-rgu-purple text-on-brand text-sm">
          <div className="mx-auto max-w-6xl px-4 py-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <span className="text-base font-extrabold uppercase">{LAB.name}</span>
            <ul className="meta" aria-label="About this site">
              <li>Prototype</li>
              <li>Demo data</li>
              <li>Times in UK time</li>
            </ul>
          </div>
        </footer>
      </body>
    </html>
  );
}
