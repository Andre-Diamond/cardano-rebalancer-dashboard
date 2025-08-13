import React from 'react';
import type { Holding } from '../types';
import styles from '../styles/Wallets.module.css';

export default function HoldingsTable({ title, data, totalUsd, walletUsdDenom, portfolioPercentByTokenId }: { title: string; data: Holding[]; totalUsd: number; walletUsdDenom?: number; portfolioPercentByTokenId?: Record<string, number> }) {
    return (
        <div className={styles.holdings}>
            <div className={styles.holdingsHeaderRow}>
                <h4 className={styles.holdingsHeaderTitle}>{title}</h4>
                <div className={styles.holdingsHeaderTotal}>Total USD: ${totalUsd.toFixed(2)}</div>
            </div>
            <div className={styles.holdingsGrid}>
                <div className={styles.headerCell}>Token</div>
                <div className={styles.headerCell}>Quantity</div>
                <div className={styles.headerCell}>Rate (USD)</div>
                <div className={styles.headerCell}>USD</div>
                <div className={styles.headerCell}>USD %</div>
                <div className={styles.headerCell}>Portfolio %</div>
                {(data || []).map((h: Holding, i: number) => (
                    <React.Fragment key={i}>
                        <div>{h.ticker || h.name || (h.is_ada ? 'ADA' : 'Token')}</div>
                        <div>{Number(h.quantity).toFixed(6)}</div>
                        <div>
                            {(() => {
                                const qty = Number(h.quantity) || 0;
                                const usd = Number(h.usd_value) || 0;
                                if (qty <= 0 || usd <= 0) return '-';
                                return `$${(usd / qty).toFixed(6)}`;
                            })()}
                        </div>
                        <div>${Number(h.usd_value || 0).toFixed(2)}</div>
                        <div>
                            {(() => {
                                const denom = Number(walletUsdDenom) || 0;
                                const val = Number(h.usd_value) || 0;
                                if (denom <= 0 || val <= 0) return '-';
                                return `${((val / denom) * 100).toFixed(2)}%`;
                            })()}
                        </div>
                        <div>
                            {h.token_id && portfolioPercentByTokenId && portfolioPercentByTokenId[h.token_id] != null
                                ? `${Number(portfolioPercentByTokenId[h.token_id]).toFixed(2)}%`
                                : '-'}
                        </div>
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}


