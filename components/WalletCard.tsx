import React from 'react';
import { useMutation } from 'react-query';
import toast from 'react-hot-toast';
import styles from '../styles/Wallets.module.css';
import type { Wallet, Holding, PortfolioRow, HoldingsResponse } from '../types';
import { apiRequest } from '../lib/apiRequest';
import { useData } from '../lib/dataContext';
import WalletPortfolioSummary from './WalletPortfolioSummary';
import HoldingsTable from './HoldingsTable';
import WalletTargetsEditor from './WalletTargetsEditor';

export default function WalletCard({ wallet }: { wallet: Wallet }) {
    const { getHoldings, getPortfolio, invalidatePortfolio, invalidateHoldings } = useData();

    const [editing, setEditing] = React.useState(false);
    const [portfolioRows, setPortfolioRows] = React.useState<PortfolioRow[] | null>(null);
    const [allHoldings, setAllHoldings] = React.useState<HoldingsResponse | null>(null);

    React.useEffect(() => {
        if (!editing) return;
        let cancelled = false;
        (async () => {
            try {
                const [pr, hs] = await Promise.all([
                    getPortfolio(wallet.id),
                    getHoldings(wallet.id, false),
                ]);
                if (!cancelled) {
                    setPortfolioRows(pr);
                    setAllHoldings(hs);
                }
            } catch {
                if (!cancelled) {
                    setPortfolioRows([]);
                    setAllHoldings({ wallet_id: wallet.id, is_using_fallback_rate: false, ada_usd: 0, holdings: [], total_usd_value: 0 });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [editing, wallet.id, getPortfolio, getHoldings]);

    const [targets, setTargets] = React.useState<Record<string, number>>({});
    React.useEffect(() => {
        if (!portfolioRows) return;
        const m: Record<string, number> = {};
        for (const row of portfolioRows) {
            m[row.token_id] = Number(row.target_weight_percent);
        }
        setTargets(m);
    }, [portfolioRows]);

    const editableHoldings: Holding[] = React.useMemo(() => {
        const hs = allHoldings?.holdings ?? [];
        return hs.filter(h => {
            if (!h.token_id) return false;
            if (h.is_ada) return true;
            const qty = Number(h.quantity);
            return qty !== 1;
        });
    }, [allHoldings]);

    const nonNftHoldingsForDisplay: Holding[] = React.useMemo(() => {
        const hs = allHoldings?.holdings ?? [];
        return hs.filter(h => h.is_ada || Number(h.quantity) !== 1);
    }, [allHoldings]);

    const portfolioPercentByTokenId = React.useMemo(() => {
        const rows = portfolioRows ?? [];
        const m: Record<string, number> = {};
        for (const r of rows) {
            m[r.token_id] = Number(r.target_weight_percent) || 0;
        }
        return m;
    }, [portfolioRows]);

    const allowedTokenIds = React.useMemo(() => new Set((editableHoldings || []).map(h => h.token_id!).filter(Boolean)), [editableHoldings]);

    const savePortfolio = useMutation({
        mutationFn: () => {
            const rows = Object.entries(targets)
                .filter(([token_id, pct]) => Number(pct) > 0 && allowedTokenIds.has(token_id))
                .map(([token_id, target_weight_percent]) => ({ token_id, target_weight_percent: Number(target_weight_percent) }));
            if (rows.length === 0) throw new Error('Set at least one target');
            const totalPercent = Object.values(targets).reduce((s, v) => s + (Number(v) || 0), 0);
            if (Math.round(totalPercent * 100) !== 10000) throw new Error('Targets must sum to 100');
            return apiRequest(`/api/wallets/${wallet.id}/portfolio`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets: rows })
            });
        },
        onSuccess: () => {
            toast.success('Portfolio saved');
            invalidatePortfolio(wallet.id);
            getPortfolio(wallet.id).then(setPortfolioRows).catch(() => { });
        },
        onError: (e: unknown) => {
            toast.error(e instanceof Error ? e.message : 'Failed to save');
        }
    });

    const syncTokens = useMutation({
        mutationFn: () => apiRequest<{ ok: boolean }>(`/api/wallets/${wallet.id}/sync-tokens`, { method: 'POST' }),
        onSuccess: () => {
            toast.success('Tokens synced');
            invalidateHoldings(wallet.id);
        },
        onError: () => {
            toast.error('Failed to sync tokens');
        }
    });

    const snapshotWallet = useMutation({
        mutationFn: () => apiRequest(`/api/wallets/${wallet.id}/snapshot`, { method: 'POST' }),
        onSuccess: () => {
            toast.success('Snapshot saved');
        },
        onError: (e: unknown) => {
            toast.error(e instanceof Error ? e.message : 'Failed to take snapshot');
        }
    });

    return (
        <div className={styles.walletCard}>
            <div className={styles.walletHeaderRow}>
                <div>
                    <div className={styles.walletName}>{wallet.name}</div>
                    <div className={styles.walletAddress}>{wallet.address}</div>
                </div>
                <div className={styles.actions}>
                    <button onClick={() => syncTokens.mutate()} disabled={syncTokens.isLoading}>Sync Tokens</button>
                    <button onClick={() => snapshotWallet.mutate()} disabled={snapshotWallet.isLoading}>Take Snapshot</button>
                    <button onClick={() => setEditing(prev => !prev)}>
                        {editing ? 'Close Portfolio' : 'Edit Portfolio'}
                    </button>
                </div>
            </div>
            {!editing && (
                <WalletPortfolioSummary walletId={wallet.id} />
            )}
            {editing && (
                <div className={styles.editSection}>
                    <HoldingsTable
                        title="All Token Holdings"
                        data={nonNftHoldingsForDisplay}
                        totalUsd={allHoldings?.total_usd_value || 0}
                        walletUsdDenom={allHoldings?.holdings.reduce((s, h) => s + (Number(h.usd_value) > 0 ? Number(h.usd_value) : 0), 0)}
                        portfolioPercentByTokenId={portfolioPercentByTokenId}
                    />
                    <WalletTargetsEditor
                        editableHoldings={editableHoldings}
                        onSave={() => savePortfolio.mutate()}
                        isSaving={savePortfolio.isLoading}
                        targets={targets}
                        setTargets={setTargets}
                    />
                </div>
            )}
        </div>
    );
}


