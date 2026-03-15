import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "AMMF Data Preparation",
  description: "Agentic AI utility for Acquirer Merchant Master File preparation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="bg-visa-navy text-white">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/visa-logo.svg" alt="Visa" className="h-8 w-auto" />
              <div className="w-px h-8 bg-visa-gray-500" />
              <div>
                <h1 className="text-lg font-bold tracking-tight">AMMF Data Preparation</h1>
                <p className="text-xs text-visa-gray-300">Acquirer Merchant Data Compliance</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-visa-gray-300">Powered by</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/exl-logo.svg" alt="EXL" className="h-5 w-auto" />
              <span className="text-xs font-semibold text-white">data.AI</span>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
