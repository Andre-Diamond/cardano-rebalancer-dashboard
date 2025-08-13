import React from 'react';
import { apiRequest } from './apiRequest';
import type { Wallet, Rates, HoldingsResponse, PortfolioRow, DataContextValue } from '../types';

const DataContext = React.createContext<DataContextValue | undefined>(undefined);

const FIVE_MIN_MS = 5 * 60 * 1000;

function nowTs(): number {
    return Date.now();
}

function safeGetLocalStorage<T>(key: string): { ts: number; data: T } | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.ts !== 'number') return null;
        return parsed as { ts: number; data: T };
    } catch {
        return null;
    }
}

function safeSetLocalStorage<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key, JSON.stringify({ ts: nowTs(), data: value }));
    } catch {
        // ignore
    }
}

function isFresh(storedTs: number | null | undefined, ttlMs: number = FIVE_MIN_MS): boolean {
    if (!storedTs) return false;
    return nowTs() - storedTs < ttlMs;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
    const [wallets, setWallets] = React.useState<Wallet[] | null>(null);
    const [rates, setRates] = React.useState<Rates>({ adaUsd: null, isFallback: false, updatedAt: null });

    const localKeys = React.useMemo(() => ({
        wallets: 'data_wallets',
        rates: 'data_rates',
        holdings: (walletId: string, portfolioOnly: boolean) => `data_holdings_${walletId}_${portfolioOnly ? 'portfolio' : 'all'}`,
        portfolio: (walletId: string) => `data_portfolio_${walletId}`,
    }), []);

    // Hydrate from localStorage on mount
    React.useEffect(() => {
        const w = safeGetLocalStorage<Wallet[]>(localKeys.wallets);
        if (w && isFresh(w.ts)) setWallets(w.data);
        const r = safeGetLocalStorage<Rates>(localKeys.rates);
        if (r && isFresh(r.ts)) setRates(r.data);
    }, [localKeys]);

    const fetchWallets = React.useCallback(async (): Promise<Wallet[]> => {
        const res = await apiRequest<Wallet[]>('/api/wallets', { method: 'GET' });
        setWallets(res);
        safeSetLocalStorage(localKeys.wallets, res);
        return res;
    }, [localKeys]);

    const getWallets = React.useCallback(async (): Promise<Wallet[]> => {
        const cached = safeGetLocalStorage<Wallet[]>(localKeys.wallets);
        if (cached && isFresh(cached.ts)) {
            if (!wallets) setWallets(cached.data);
            return cached.data;
        }
        if (wallets && isFresh(rates.updatedAt)) {
            // wallets state may be fresh even if localStorage expired; use it if present
            return wallets;
        }
        return fetchWallets();
    }, [localKeys, wallets, rates.updatedAt, fetchWallets]);

    const getHoldings = React.useCallback(async (walletId: string, portfolioOnly: boolean = false): Promise<HoldingsResponse> => {
        const key = localKeys.holdings(walletId, portfolioOnly);
        const cached = safeGetLocalStorage<HoldingsResponse>(key);
        if (cached && isFresh(cached.ts)) {
            // also sync rates from cached holdings
            if (typeof cached.data?.ada_usd === 'number') {
                setRates(() => {
                    const next: Rates = { adaUsd: cached.data.ada_usd, isFallback: Boolean(cached.data.is_using_fallback_rate), updatedAt: cached.ts };
                    safeSetLocalStorage(localKeys.rates, next);
                    return next;
                });
            }
            return cached.data;
        }
        const res = await apiRequest<HoldingsResponse>(`/api/wallets/${walletId}/holdings?portfolioOnly=${portfolioOnly ? 'true' : 'false'}`, { method: 'GET' });
        safeSetLocalStorage(key, res);
        // update rates from fresh fetch
        setRates(() => {
            const next: Rates = { adaUsd: res.ada_usd, isFallback: Boolean(res.is_using_fallback_rate), updatedAt: nowTs() };
            safeSetLocalStorage(localKeys.rates, next);
            return next;
        });
        return res;
    }, [localKeys]);

    const getPortfolio = React.useCallback(async (walletId: string): Promise<PortfolioRow[]> => {
        const key = localKeys.portfolio(walletId);
        const cached = safeGetLocalStorage<PortfolioRow[]>(key);
        if (cached && isFresh(cached.ts)) return cached.data;
        const res = await apiRequest<PortfolioRow[]>(`/api/wallets/${walletId}/portfolio`, { method: 'GET' });
        safeSetLocalStorage(key, res);
        return res;
    }, [localKeys]);

    const invalidateWallets = React.useCallback(() => {
        if (typeof window !== 'undefined') window.localStorage.removeItem(localKeys.wallets);
    }, [localKeys]);

    const invalidateHoldings = React.useCallback((walletId: string) => {
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(localKeys.holdings(walletId, true));
            window.localStorage.removeItem(localKeys.holdings(walletId, false));
        }
    }, [localKeys]);

    const invalidatePortfolio = React.useCallback((walletId: string) => {
        if (typeof window !== 'undefined') window.localStorage.removeItem(localKeys.portfolio(walletId));
    }, [localKeys]);

    const refreshWallets = React.useCallback(async (): Promise<Wallet[]> => {
        invalidateWallets();
        return fetchWallets();
    }, [invalidateWallets, fetchWallets]);

    const value: DataContextValue = React.useMemo(() => ({
        wallets,
        rates,
        getWallets,
        getHoldings,
        getPortfolio,
        invalidateWallets,
        invalidateHoldings,
        invalidatePortfolio,
        refreshWallets,
    }), [wallets, rates, getWallets, getHoldings, getPortfolio, invalidateWallets, invalidateHoldings, invalidatePortfolio, refreshWallets]);

    return (
        <DataContext.Provider value={value}>{children}</DataContext.Provider>
    );
}

export function useData(): DataContextValue {
    const ctx = React.useContext(DataContext);
    if (!ctx) throw new Error('useData must be used within a DataProvider');
    return ctx;
}


