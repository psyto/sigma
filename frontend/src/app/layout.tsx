import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/contexts/WalletProvider";
import { SigmaProvider } from "@/contexts/SigmaProvider";
import { ToastProvider } from "@/components/Toast";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sigma | DeFi Derivatives Protocol",
  description: "Trade variance swaps, funding rate derivatives, and exotic options on Solana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WalletProvider>
          <SigmaProvider>
            <ToastProvider>
              <div className="flex min-h-screen">
                <Sidebar />
                <div className="flex-1 ml-64">
                  <Header />
                  <main className="p-6">{children}</main>
                </div>
              </div>
            </ToastProvider>
          </SigmaProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
