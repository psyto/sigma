"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ShoppingCart, Tag, Clock, TrendingUp, Wallet, AlertCircle, Filter } from "lucide-react";

const mockListings = [
  {
    id: 1,
    protocol: "VolSwap",
    type: "Long Variance",
    strike: 35,
    notional: 10000,
    currentValue: 11200,
    askPrice: 1150,
    discount: -2.7,
    expiry: "2024-02-15",
    daysLeft: 12,
    seller: "8xK4...mPq2",
  },
  {
    id: 2,
    protocol: "FundingSwap",
    type: "Receive Fixed",
    strike: 0.04,
    notional: 50000,
    currentValue: 52100,
    askPrice: 2000,
    discount: 4.8,
    expiry: "2024-02-22",
    daysLeft: 19,
    seller: "3jF7...kR9n",
  },
  {
    id: 3,
    protocol: "ExoticVault",
    type: "Knock-In Put",
    strike: 85,
    notional: 5000,
    currentValue: 5850,
    askPrice: 820,
    discount: 3.6,
    expiry: "2024-02-10",
    daysLeft: 7,
    seller: "9pL2...xW4m",
  },
  {
    id: 4,
    protocol: "VolSwap",
    type: "Short Variance",
    strike: 42,
    notional: 25000,
    currentValue: 24100,
    askPrice: -950,
    discount: 5.2,
    expiry: "2024-02-28",
    daysLeft: 25,
    seller: "4kM8...zQ1v",
  },
];

const myPositions = [
  {
    id: 1,
    protocol: "VolSwap",
    type: "Long Variance",
    strike: 30,
    notional: 15000,
    currentValue: 16200,
    expiry: "2024-02-20",
    daysLeft: 17,
    listed: false,
  },
  {
    id: 2,
    protocol: "ExoticVault",
    type: "Asian Call",
    strike: 105,
    notional: 8000,
    currentValue: 8450,
    expiry: "2024-03-01",
    daysLeft: 26,
    listed: true,
    askPrice: 420,
  },
];

const protocolColors: Record<string, string> = {
  VolSwap: "#8b5cf6",
  FundingSwap: "#06b6d4",
  ExoticVault: "#f59e0b",
};

export default function SecondaryMarketPage() {
  const { connected } = useWallet();
  const [activeTab, setActiveTab] = useState<"browse" | "my-positions">("browse");
  const [filterProtocol, setFilterProtocol] = useState<string>("all");
  const [showListingModal, setShowListingModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<any>(null);
  const [askPrice, setAskPrice] = useState("");

  const filteredListings = filterProtocol === "all"
    ? mockListings
    : mockListings.filter((l) => l.protocol === filterProtocol);

  const handleBuy = (listing: any) => {
    if (!connected) {
      alert("Please connect your wallet first");
      return;
    }
    console.log("Buying position:", listing);
  };

  const handleList = (position: any) => {
    setSelectedPosition(position);
    setShowListingModal(true);
  };

  const handleConfirmListing = () => {
    console.log("Listing position:", selectedPosition, "at", askPrice);
    setShowListingModal(false);
    setAskPrice("");
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
          Secondary Market
        </h1>
        <p className="text-[var(--muted)]">
          Trade positions before expiry. Buy discounted positions or exit early.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-sm text-[var(--muted)]">Active Listings</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {mockListings.length}
          </p>
          <p className="text-sm text-[var(--muted)]">Positions for sale</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-[var(--success)]" />
            <span className="text-sm text-[var(--muted)]">Total Value Listed</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            $93.3K
          </p>
          <p className="text-sm text-[var(--muted)]">Notional value</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-[#f59e0b]" />
            <span className="text-sm text-[var(--muted)]">Avg Discount</span>
          </div>
          <p className="text-2xl font-bold text-[var(--success)]">
            +2.7%
          </p>
          <p className="text-sm text-[var(--muted)]">From mark-to-market</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-[var(--muted)]" />
            <span className="text-sm text-[var(--muted)]">Avg Days to Expiry</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            16
          </p>
          <p className="text-sm text-[var(--muted)]">Listed positions</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("browse")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "browse"
              ? "bg-[var(--primary)] text-white"
              : "bg-[var(--card)] text-[var(--muted)] border border-[var(--border)] hover:text-[var(--foreground)]"
          }`}
        >
          Browse Market
        </button>
        <button
          onClick={() => setActiveTab("my-positions")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "my-positions"
              ? "bg-[var(--primary)] text-white"
              : "bg-[var(--card)] text-[var(--muted)] border border-[var(--border)] hover:text-[var(--foreground)]"
          }`}
        >
          My Positions
        </button>
      </div>

      {activeTab === "browse" && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[var(--muted)]" />
              <span className="text-sm text-[var(--muted)]">Filter:</span>
            </div>
            {["all", "VolSwap", "FundingSwap", "ExoticVault"].map((protocol) => (
              <button
                key={protocol}
                onClick={() => setFilterProtocol(protocol)}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                  filterProtocol === protocol
                    ? "bg-[var(--primary)]20 text-[var(--primary)] border border-[var(--primary)]"
                    : "bg-[var(--background)] text-[var(--muted)] border border-[var(--border)] hover:text-[var(--foreground)]"
                }`}
              >
                {protocol === "all" ? "All" : protocol}
              </button>
            ))}
          </div>

          {/* Listings Grid */}
          <div className="grid grid-cols-2 gap-4">
            {filteredListings.map((listing) => (
              <div
                key={listing.id}
                className="bg-[var(--card)] rounded-xl p-5 border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{
                        backgroundColor: `${protocolColors[listing.protocol]}20`,
                        color: protocolColors[listing.protocol],
                      }}
                    >
                      {listing.protocol}
                    </span>
                    <h3 className="text-lg font-semibold text-[var(--foreground)] mt-2">
                      {listing.type}
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[var(--muted)]">{listing.daysLeft} days left</p>
                    <p className="text-xs text-[var(--muted)]">Expires {listing.expiry}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-[var(--muted)]">Strike</p>
                    <p className="font-medium text-[var(--foreground)]">
                      {listing.protocol === "FundingSwap"
                        ? `${(listing.strike * 100).toFixed(2)}%`
                        : listing.protocol === "ExoticVault"
                        ? `$${listing.strike}`
                        : `${listing.strike}%`}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-[var(--muted)]">Notional</p>
                    <p className="font-medium text-[var(--foreground)]">
                      ${listing.notional.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-[var(--muted)]">Mark-to-Market</p>
                    <p className="font-medium text-[var(--foreground)]">
                      ${listing.currentValue.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-[var(--muted)]">Ask Price</p>
                    <p className={`font-medium ${listing.askPrice >= 0 ? "text-[var(--foreground)]" : "text-[var(--danger)]"}`}>
                      {listing.askPrice >= 0 ? "$" : "-$"}{Math.abs(listing.askPrice).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        listing.discount >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                      }`}
                    >
                      {listing.discount >= 0 ? "+" : ""}{listing.discount}% vs MTM
                    </span>
                  </div>
                  <button
                    onClick={() => handleBuy(listing)}
                    className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-hover)] transition-colors"
                  >
                    Buy Position
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === "my-positions" && (
        <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Your Positions
          </h2>

          {!connected ? (
            <div className="text-center py-12">
              <Wallet className="w-12 h-12 text-[var(--muted)] mx-auto mb-4" />
              <p className="text-[var(--muted)]">Connect your wallet to view positions</p>
            </div>
          ) : myPositions.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-[var(--muted)] mx-auto mb-4" />
              <p className="text-[var(--muted)]">No positions to list</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Protocol</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Notional</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Current Value</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Expiry</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myPositions.map((position) => (
                    <tr key={position.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-4 px-4">
                        <span
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${protocolColors[position.protocol]}20`,
                            color: protocolColors[position.protocol],
                          }}
                        >
                          {position.protocol}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-[var(--foreground)]">{position.type}</td>
                      <td className="py-4 px-4 text-[var(--foreground)]">
                        ${position.notional.toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-[var(--foreground)]">
                        ${position.currentValue.toLocaleString()}
                      </td>
                      <td className="py-4 px-4">
                        <div>
                          <p className="text-[var(--foreground)]">{position.expiry}</p>
                          <p className="text-xs text-[var(--muted)]">{position.daysLeft} days</p>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {position.listed ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-[var(--success)]20 text-[var(--success)]">
                            Listed @ ${position.askPrice}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-[var(--muted)]20 text-[var(--muted)]">
                            Not Listed
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {position.listed ? (
                          <button className="px-3 py-1 text-sm rounded bg-[var(--danger)]20 text-[var(--danger)] hover:bg-[var(--danger)]30 transition-colors">
                            Cancel
                          </button>
                        ) : (
                          <button
                            onClick={() => handleList(position)}
                            className="px-3 py-1 text-sm rounded bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors"
                          >
                            List for Sale
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Listing Modal */}
      {showListingModal && selectedPosition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card)] rounded-xl p-6 w-full max-w-md border border-[var(--border)]">
            <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
              List Position for Sale
            </h2>

            <div className="mb-4 p-4 rounded-lg bg-[var(--background)]">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-[var(--muted)]">Protocol</span>
                <span className="text-sm text-[var(--foreground)]">{selectedPosition.protocol}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-[var(--muted)]">Type</span>
                <span className="text-sm text-[var(--foreground)]">{selectedPosition.type}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-[var(--muted)]">Notional</span>
                <span className="text-sm text-[var(--foreground)]">${selectedPosition.notional.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-[var(--muted)]">Current Value</span>
                <span className="text-sm text-[var(--foreground)]">${selectedPosition.currentValue.toLocaleString()}</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm text-[var(--muted)] mb-2 block">
                Ask Price (USDC)
              </label>
              <input
                type="number"
                value={askPrice}
                onChange={(e) => setAskPrice(e.target.value)}
                placeholder={`${(selectedPosition.currentValue * 0.1).toFixed(0)}`}
                className="w-full px-4 py-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--primary)]"
              />
              <p className="text-xs text-[var(--muted)] mt-1">
                Suggested: ${(selectedPosition.currentValue * 0.1).toFixed(0)} (10% of value)
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[var(--primary)]20 mb-4">
              <p className="text-xs text-[var(--muted)]">
                A 0.5% fee will be charged upon successful sale. You can cancel the listing anytime before it sells.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowListingModal(false)}
                className="flex-1 py-3 rounded-lg bg-[var(--background)] text-[var(--muted)] font-medium hover:text-[var(--foreground)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmListing}
                disabled={!askPrice}
                className="flex-1 py-3 rounded-lg bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                List Position
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="mt-6 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
          How Secondary Market Works
        </h2>
        <div className="grid grid-cols-4 gap-6">
          <div>
            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]20 flex items-center justify-center mb-3">
              <span className="text-[var(--primary)] font-bold">1</span>
            </div>
            <h3 className="font-medium text-[var(--foreground)] mb-2">
              Tokenize
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Convert your Sigma position into a tradeable token representing ownership.
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]20 flex items-center justify-center mb-3">
              <span className="text-[var(--primary)] font-bold">2</span>
            </div>
            <h3 className="font-medium text-[var(--foreground)] mb-2">
              List
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Set your ask price and list on the marketplace. Cancel anytime before sale.
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]20 flex items-center justify-center mb-3">
              <span className="text-[var(--primary)] font-bold">3</span>
            </div>
            <h3 className="font-medium text-[var(--foreground)] mb-2">
              Sell
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Buyer purchases at your ask price. Position transfers atomically with payment.
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]20 flex items-center justify-center mb-3">
              <span className="text-[var(--primary)] font-bold">4</span>
            </div>
            <h3 className="font-medium text-[var(--foreground)] mb-2">
              Exit
            </h3>
            <p className="text-sm text-[var(--muted)]">
              You receive USDC immediately. Buyer holds position until settlement.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
