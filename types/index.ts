// Shared domain types

export type Wallet = {
    id: string;
    name: string;
    address: string;
    is_active: boolean;
    threshold_percent: number;
    config: Record<string, unknown>;
    created_at: string;
};

export type Token = {
    id: string;
    policy_id: string | null;
    asset_name: string | null;
    is_ada: boolean;
    ticker: string | null;
    name: string | null;
    decimals: number;
    fingerprint?: string | null;
    metadata?: Record<string, unknown> | null;
};

export type TargetRow = { token_id: string; target_weight_percent: number };

export type PortfolioRow = { wallet_id: string; token_id: string; target_weight_percent: number };

export type Holding = {
    token_id: string | null;
    policy_id: string | null;
    asset_name: string | null;
    ticker: string | null;
    name: string | null;
    is_ada: boolean;
    decimals: number;
    quantity: number;
    usd_value: number;
};

export type HoldingsResponse = {
    wallet_id: string;
    is_using_fallback_rate: boolean;
    ada_usd: number;
    holdings: Holding[];
    total_usd_value: number;
};

export type Rates = {
    adaUsd: number | null;
    isFallback: boolean;
    updatedAt: number | null;
};

export type DataContextValue = {
    wallets: Wallet[] | null;
    rates: Rates;
    getWallets: () => Promise<Wallet[]>;
    getHoldings: (walletId: string, portfolioOnly?: boolean, preferCache?: boolean) => Promise<HoldingsResponse>;
    getPortfolio: (walletId: string) => Promise<PortfolioRow[]>;
    getSnapshots: (walletId: string) => Promise<WalletSnapshotRow[]>;
    invalidateWallets: () => void;
    invalidateHoldings: (walletId: string) => void;
    invalidatePortfolio: (walletId: string) => void;
    invalidateSnapshots: (walletId: string) => void;
    refreshWallets: () => Promise<Wallet[]>;
};

// Koios API related types
export interface KoiosAsset {
    policy_id: string;
    asset_name: string; // hex
    quantity?: string;
}

export interface KoiosAssetInfoResponse {
    policy_id: string;
    asset_name: string; // hex
    asset_name_ascii?: string;
    fingerprint?: string;
    token_registry_metadata?: {
        ticker?: string;
        name?: string;
        description?: string | string[];
        decimals?: number | string;
        url?: string;
    } | null;
}

// Snapshot holdings (stored in DB snapshot meta). Simplified structure used in snapshot API.
export type SnapshotHolding = {
    token_id: string | null;
    policy_id: string | null;
    asset_name: string | null;
    quantity: number;
    usd_value: number;
    ticker: string | null;
    // Optional enrichment fields that may be stored for convenience
    is_ada?: boolean;
    decimals?: number;
    name?: string | null;
};

// API response type for wallet snapshots
export type WalletSnapshotRow = {
    snapshot_date: string; // YYYY-MM-DD
    taken_at: string; // ISO timestamp
    total_usd_value: number;
    holdings: SnapshotHolding[];
};


