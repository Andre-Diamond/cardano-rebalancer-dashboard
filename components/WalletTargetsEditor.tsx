import React, { useMemo } from 'react';
import type { Holding } from '../types';
import styles from '../styles/Wallets.module.css';

export type WalletTargetsEditorProps = {
    editableHoldings: Holding[];
    onSave: () => void;
    isSaving: boolean;
    targets: Record<string, number>;
    setTargets: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    thresholdsByTokenId: Record<string, number>;
    setThresholdsByTokenId: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    globalThresholdPercent: number;
    setGlobalThresholdPercent: React.Dispatch<React.SetStateAction<number>>;
};

export default function WalletTargetsEditor({ editableHoldings, onSave, isSaving, targets, setTargets, thresholdsByTokenId, setThresholdsByTokenId, globalThresholdPercent, setGlobalThresholdPercent }: WalletTargetsEditorProps) {
    const totalPercent = useMemo(() => Object.values(targets).reduce((s, v) => s + (Number(v) || 0), 0), [targets]);

    return (
        <div className={styles.editSection}>
            <div className={styles.targetsGrid}>
                <div className={styles.headerCell}>Token</div>
                <div className={styles.headerCell}>Target %</div>
                <div className={styles.headerCell}>Threshold %</div>
                {editableHoldings.map((h: Holding) => (
                    <React.Fragment key={h.token_id as string}>
                        <div>
                            <div className={styles.tokenName}>{h.ticker || h.name || (h.is_ada ? 'ADA' : 'Token')}</div>
                            {!h.is_ada && (<div className={styles.tokenId}>{h.policy_id}:{h.asset_name}</div>)}
                        </div>
                        <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            value={targets[h.token_id as string] ?? 0}
                            onChange={e => setTargets(s => ({ ...s, [h.token_id as string]: Number(e.target.value) }))}
                        />
                        <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            value={thresholdsByTokenId[h.token_id as string] ?? ''}
                            onChange={e => setThresholdsByTokenId(prev => {
                                const next = { ...prev } as Record<string, number>;
                                const key = h.token_id as string;
                                if (e.target.value === '') {
                                    delete next[key];
                                } else {
                                    next[key] = Number(e.target.value);
                                }
                                return next;
                            })}
                            placeholder={String(globalThresholdPercent)}
                        />
                    </React.Fragment>
                ))}
            </div>
            <div className={styles.totalsRow}>
                <div>Total: {totalPercent.toFixed(2)}%</div>
                <div>
                    <label style={{ marginRight: 8 }}>Global threshold %</label>
                    <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        value={Number.isFinite(globalThresholdPercent) ? globalThresholdPercent : 0}
                        onChange={e => setGlobalThresholdPercent(Number(e.target.value))}
                        style={{ width: 100, marginRight: 8 }}
                    />
                    <button onClick={onSave} disabled={isSaving || Math.round(totalPercent * 100) !== 10000}>Save</button>
                </div>
            </div>
        </div>
    );
}


