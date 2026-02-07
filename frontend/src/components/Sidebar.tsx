"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  TrendingUp,
  RefreshCw,
  Gem,
  Droplets,
  Home,
  Activity,
  Building2,
  ShoppingCart,
} from "lucide-react";

// Get network from environment
const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "localnet";
const NETWORK_DISPLAY: Record<string, string> = {
  localnet: "Localnet",
  devnet: "Devnet",
  "mainnet-beta": "Mainnet",
};

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Oracle", href: "/oracle", icon: BarChart3 },
  { name: "VolSwap", href: "/volswap", icon: TrendingUp },
  { name: "FundingSwap", href: "/funding-swap", icon: RefreshCw },
  { name: "ExoticVault", href: "/exotic-vault", icon: Gem },
  { name: "Liquidity", href: "/liquidity", icon: Droplets },
  { name: "Volatility Index", href: "/volatility-index", icon: Activity },
  { name: "CEX Funding", href: "/cex-funding", icon: Building2 },
  { name: "Secondary Market", href: "/secondary-market", icon: ShoppingCart },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--primary)] flex items-center justify-center">
            <span className="text-[var(--background)] font-bold text-xl">Σ</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Sigma</h1>
            <p className="text-xs text-[var(--muted)]">DeFi Derivatives</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? "bg-[var(--primary)] text-[var(--background)]"
                      : "text-[var(--muted)] hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Network indicator */}
      <div className="p-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--background)]">
          <div className={`w-2 h-2 rounded-full animate-pulse ${
            NETWORK === "mainnet-beta" ? "bg-[var(--success)]" :
            NETWORK === "devnet" ? "bg-[var(--warning)]" :
            "bg-[#3b82f6]"
          }`} />
          <span className="text-sm text-[var(--muted)]">
            {NETWORK_DISPLAY[NETWORK] || NETWORK}
          </span>
        </div>
      </div>
    </aside>
  );
}
