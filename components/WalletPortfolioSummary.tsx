import React from 'react';
import HoldingsTable from './HoldingsTable';
import { useData } from '../lib/dataContext';
import type { HoldingsResponse, PortfolioRow } from '../types';
import styles from '../styles/Wallets.module.css';

export default function WalletPortfolioSummary({ walletId }: { walletId: string }) {
    const { getHoldings, getPortfolio } = useData();
    const [holdings, setHoldings] = React.useState<HoldingsResponse | null>(null);
    const [portfolioRows, setPortfolioRows] = React.useState<PortfolioRow[] | null>(null);
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [h, p] = await Promise.all([
                    getHoldings(walletId, true),
                    getPortfolio(walletId)
                ]);
                if (!cancelled) {
                    setHoldings(h);
                    setPortfolioRows(p);
                }
            } catch {
                if (!cancelled) {
                    setHoldings(null);
                    setPortfolioRows([]);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [walletId, getHoldings, getPortfolio]);
    const portfolioPercentByTokenId = React.useMemo(() => {
        const rows = portfolioRows ?? [];
        const m: Record<string, number> = {};
        for (const r of rows) m[r.token_id] = Number(r.target_weight_percent) || 0;
        return m;
    }, [portfolioRows]);
    if (!holdings) return null;
    return (
        <div className={styles.portfolioSummary}>
            <HoldingsTable
                title="Portfolio Holdings"
                data={holdings.holdings}
                totalUsd={holdings.total_usd_value}
                walletUsdDenom={holdings.holdings.reduce((s, h) => s + (Number(h.usd_value) > 0 ? Number(h.usd_value) : 0), 0)}
                portfolioPercentByTokenId={portfolioPercentByTokenId}
            />
        </div>
    );
}


