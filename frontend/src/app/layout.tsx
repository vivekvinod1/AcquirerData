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
              <div className="w-10 h-10 bg-visa-gold rounded-lg flex items-center justify-center font-bold text-visa-navy text-lg">
                V
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">AMMF Data Preparation</h1>
                <p className="text-xs text-visa-gray-300">Acquirer Merchant Data Compliance</p>
              </div>
            </div>
            <span className="text-xs text-visa-gray-300">Powered by Agentic AI</span>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
