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
import WalletCharts from './WalletCharts';
import { useMutation as useMutation2 } from 'react-query';

export default function WalletCard({ wallet }: { wallet: Wallet }) {
    const { getHoldings, getPortfolio, getSnapshots, invalidatePortfolio, invalidateHoldings, invalidateWallets } = useData();

    const [editing, setEditing] = React.useState(false);
    const [snapshots, setSnapshots] = React.useState<import('../types').WalletSnapshotRow[] | null>(null);
    const [showCharts, setShowCharts] = React.useState(false);
    const [portfolioRows, setPortfolioRows] = React.useState<PortfolioRow[] | null>(null);
    const [allHoldings, setAllHoldings] = React.useState<HoldingsResponse | null>(null);
    const [rebalanceOpen, setRebalanceOpen] = React.useState(false);
    const [rebalanceMessage, setRebalanceMessage] = React.useState<string>('');

    React.useEffect(() => {
        if (!editing) return;
        let cancelled = false;
        (async () => {
            try {
                const [pr, hs] = await Promise.all([
                    getPortfolio(wallet.id),
                    // Prefer cached holdings (and thereby cached rates) when entering edit mode
                    getHoldings(wallet.id, false, true),
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

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const s = await getSnapshots(wallet.id);
                if (!cancelled) setSnapshots(s);
            } catch {
                if (!cancelled) setSnapshots([]);
            }
        })();
        return () => { cancelled = true; };
    }, [wallet.id, getSnapshots]);

    const [targets, setTargets] = React.useState<Record<string, number>>({});
    const [thresholdsByTokenId, setThresholdsByTokenId] = React.useState<Record<string, number>>({});
    const [globalThresholdPercent, setGlobalThresholdPercent] = React.useState<number>(Number(wallet.threshold_percent ?? 10));
    React.useEffect(() => {
        if (!portfolioRows) return;
        const m: Record<string, number> = {};
        for (const row of portfolioRows) {
            m[row.token_id] = Number(row.target_weight_percent);
        }
        setTargets(m);
    }, [portfolioRows]);

    // Initialise thresholds state from wallet.config if present
    React.useEffect(() => {
        const cfg = (wallet && wallet.config) || {} as Record<string, unknown>;
        const tbt = (cfg && typeof cfg === 'object' && (cfg as Record<string, unknown>).thresholds_by_token_id && typeof (cfg as Record<string, unknown>).thresholds_by_token_id === 'object')
            ? ((cfg as Record<string, unknown>).thresholds_by_token_id as Record<string, number>)
            : {};
        setThresholdsByTokenId(tbt || {});
        if (typeof wallet.threshold_percent === 'number') setGlobalThresholdPercent(wallet.threshold_percent);
    }, [wallet]);

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
        mutationFn: async () => {
            const rows = Object.entries(targets)
                .filter(([token_id, pct]) => Number(pct) > 0 && allowedTokenIds.has(token_id))
                .map(([token_id, target_weight_percent]) => ({ token_id, target_weight_percent: Number(target_weight_percent) }));
            if (rows.length === 0) throw new Error('Set at least one target');
            const totalPercent = Object.values(targets).reduce((s, v) => s + (Number(v) || 0), 0);
            if (Math.round(totalPercent * 100) !== 10000) throw new Error('Targets must sum to 100');
            // Save targets first
            await apiRequest(`/api/wallets/${wallet.id}/portfolio`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets: rows })
            });
            // Save thresholds (global + per-token) in wallet config
            const configUpdate: Record<string, unknown> = {
                // Merge with current to avoid wiping other keys: server will replace config, so we need to fetch current if we wanted to merge there.
                // Here we only set thresholds_by_token_id, assuming no other client-set fields. Adjust server to merge if needed.
                thresholds_by_token_id: Object.fromEntries(
                    Object.entries(thresholdsByTokenId)
                        .filter(([tokenId, val]) => allowedTokenIds.has(tokenId) && typeof val === 'number' && isFinite(val))
                )
            };
            await apiRequest(`/api/wallets/${wallet.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threshold_percent: Number(globalThresholdPercent), config: configUpdate })
            });
        },
        onSuccess: () => {
            toast.success('Portfolio saved');
            invalidatePortfolio(wallet.id);
            invalidateWallets();
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

    const computeRebalance = useMutation2({
        mutationFn: async () => {
            const res = await apiRequest<{ ok: boolean; message: string }>(`/api/wallets/${wallet.id}/rebalance-plan`, { method: 'GET' });
            return res;
        },
        onSuccess: (res) => {
            toast.success('Rebalance plan computed');
            setRebalanceMessage(res.message || '');
            setRebalanceOpen(true);
        },
        onError: (e: unknown) => {
            toast.error(e instanceof Error ? e.message : 'Failed to compute plan');
        }
    });

    const sendRebalance = useMutation2({
        mutationFn: async () => {
            const res = await apiRequest<{ ok: boolean; message: string; sent: boolean }>(`/api/wallets/${wallet.id}/rebalance-plan?send=true`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ send: true })
            });
            return res;
        },
        onSuccess: (res) => {
            toast.success(res.sent ? 'Rebalance plan sent to Discord' : 'Rebalance plan ready');
            console.log(res.message);
        },
        onError: (e: unknown) => {
            toast.error(e instanceof Error ? e.message : 'Failed to send plan');
        }
    });

    return (
        <div className={styles.walletCard}>
            <div className={styles.walletHeaderRow}>
                <div>
                    <div className={styles.walletName}>{wallet.name}</div>
                    <div className={styles.walletAddress}>{wallet.stake_address || wallet.address}</div>
                </div>
                <div className={styles.actions}>
                    <button onClick={() => syncTokens.mutate()} disabled={syncTokens.isLoading}>Sync Tokens</button>
                    <button onClick={() => snapshotWallet.mutate()} disabled={snapshotWallet.isLoading}>Take Snapshot</button>
                    <button onClick={() => computeRebalance.mutate()} disabled={computeRebalance.isLoading}>Rebalance Plan</button>
                    <button onClick={() => setEditing(prev => !prev)}>
                        {editing ? 'Close Portfolio' : 'Edit Portfolio'}
                    </button>
                </div>
            </div>
            {!editing && (
                <>
                    <WalletPortfolioSummary walletId={wallet.id} />
                    {Array.isArray(snapshots) && snapshots.length > 0 && (
                        <div>
                            {!showCharts && (
                                <button onClick={() => setShowCharts(true)}>Show Charts</button>
                            )}
                            {showCharts && (
                                <>
                                    <button onClick={() => setShowCharts(false)}>Minimise Charts</button>
                                    <WalletCharts snapshots={snapshots} />
                                </>
                            )}
                        </div>
                    )}
                </>
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
                        thresholdsByTokenId={thresholdsByTokenId}
                        setThresholdsByTokenId={setThresholdsByTokenId}
                        globalThresholdPercent={globalThresholdPercent}
                        setGlobalThresholdPercent={setGlobalThresholdPercent}
                    />
                </div>
            )}
            {rebalanceOpen && (
                <div className={styles.modalBackdrop} onClick={() => setRebalanceOpen(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>Rebalance Plan</div>
                        <div className={styles.modalBody}>
                            <pre className={styles.modalPre}>{rebalanceMessage || 'No plan available.'}</pre>
                        </div>
                        <div className={styles.modalActions}>
                            <button className={styles.modalButton} onClick={() => setRebalanceOpen(false)}>Close</button>
                            <button className={styles.modalButtonPrimary} onClick={() => sendRebalance.mutate()} disabled={sendRebalance.isLoading}>Send to Discord</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


