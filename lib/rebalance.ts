import type { Holding, PortfolioRow } from '../types';

export type RebalanceThresholds = {
    globalPercent: number;
    byTokenId?: Record<string, number>;
};

export type SwapSuggestion = {
    fromTokenId: string;
    toTokenId: string;
    usdAmount: number;
    fromTicker?: string | null;
    toTicker?: string | null;
    fromQuantity?: number; // optional, computed when price is known
    toQuantity?: number;   // optional, computed when price is known
    isNeededByThresholds?: boolean; // true if this swap addresses a threshold breach
};

export type RebalancePlan = {
    swaps: SwapSuggestion[];
    totalSellUsd: number;
    totalBuyUsd: number;
    notes?: string[];
};

type TokenMeta = { ticker?: string | null; name?: string | null };

function getThresholdForToken(tokenId: string, thresholds: RebalanceThresholds): number {
    const perToken = thresholds.byTokenId || {};
    const v = perToken[tokenId];
    if (typeof v === 'number' && isFinite(v)) return v;
    return thresholds.globalPercent;
}

function roundUsd(n: number): number {
    return Math.round(n * 100) / 100;
}

export function calculateRebalanceSwaps(
    targets: PortfolioRow[],
    holdings: Holding[],
    totalUsdValue: number,
    thresholds: RebalanceThresholds,
    tokenMetaById?: Record<string, TokenMeta>
): RebalancePlan {
    const targetPctById: Record<string, number> = {};
    for (const t of targets || []) {
        targetPctById[t.token_id] = Number(t.target_weight_percent) || 0;
    }

    // Current USD by token for tokens that are part of targets
    const usdById: Record<string, number> = {};
    const qtyById: Record<string, number> = {};
    for (const h of holdings || []) {
        const tokenId = h.token_id || '';
        if (!tokenId || !(tokenId in targetPctById)) continue;
        usdById[tokenId] = (usdById[tokenId] || 0) + (Number(h.usd_value) || 0);
        qtyById[tokenId] = (qtyById[tokenId] || 0) + (Number(h.quantity) || 0);
    }

    // Ensure tokens with targets but no holdings are present with zero
    for (const tokenId of Object.keys(targetPctById)) {
        if (!(tokenId in usdById)) usdById[tokenId] = 0;
        if (!(tokenId in qtyById)) qtyById[tokenId] = 0;
    }

    const surpluses: Array<{ tokenId: string; usd: number }> = [];
    const deficits: Array<{ tokenId: string; usd: number }> = [];

    // Determine surplus/deficit in USD aiming for target (always, regardless of threshold)
    // Also compute which tokens breach their thresholds to annotate swaps later
    const breaches = new Set<string>();
    for (const tokenId of Object.keys(targetPctById)) {
        const targetPct = targetPctById[tokenId];
        const currentUsd = usdById[tokenId] || 0;
        const currentPct = totalUsdValue > 0 ? (currentUsd / totalUsdValue) * 100 : 0;
        const deltaPct = currentPct - targetPct; // positive means over target
        const deltaUsd = (deltaPct / 100) * totalUsdValue;
        if (deltaUsd > 0.0001) {
            surpluses.push({ tokenId, usd: Math.abs(deltaUsd) });
        } else if (deltaUsd < -0.0001) {
            deficits.push({ tokenId, usd: Math.abs(deltaUsd) });
        }
        const threshold = getThresholdForToken(tokenId, thresholds);
        if (Math.abs(deltaPct) > threshold) {
            breaches.add(tokenId);
        }
    }

    // Sort: largest imbalances first
    surpluses.sort((a, b) => b.usd - a.usd);
    deficits.sort((a, b) => b.usd - a.usd);

    const swaps: SwapSuggestion[] = [];
    let i = 0, j = 0;
    while (i < surpluses.length && j < deficits.length) {
        const s = surpluses[i];
        const d = deficits[j];
        const moveUsd = roundUsd(Math.min(s.usd, d.usd));
        if (moveUsd <= 0) break;

        const fromId = s.tokenId;
        const toId = d.tokenId;
        const fromQty = qtyById[fromId] || 0;
        const toQty = qtyById[toId] || 0;
        const fromPrice = (usdById[fromId] || 0) > 0 && fromQty > 0 ? (usdById[fromId] / fromQty) : undefined;
        const toPrice = (usdById[toId] || 0) > 0 && toQty > 0 ? (usdById[toId] / toQty) : undefined;

        const swap: SwapSuggestion = {
            fromTokenId: fromId,
            toTokenId: toId,
            usdAmount: moveUsd,
            fromTicker: tokenMetaById?.[fromId]?.ticker ?? undefined,
            toTicker: tokenMetaById?.[toId]?.ticker ?? undefined,
            fromQuantity: fromPrice ? (moveUsd / fromPrice) : undefined,
            toQuantity: toPrice ? (moveUsd / toPrice) : undefined,
            isNeededByThresholds: breaches.has(fromId) || breaches.has(toId),
        };
        swaps.push(swap);

        s.usd = roundUsd(s.usd - moveUsd);
        d.usd = roundUsd(d.usd - moveUsd);
        if (s.usd <= 0.009) i++;
        if (d.usd <= 0.009) j++;
    }

    const totalSellUsd = roundUsd(swaps.reduce((s, x) => s + x.usdAmount, 0));
    const totalBuyUsd = totalSellUsd;

    return { swaps, totalSellUsd, totalBuyUsd };
}

export function formatRebalanceMessage(
    walletLabel: string,
    plan: RebalancePlan,
    tokenLabelsById?: Record<string, string>
): string {
    if (!plan.swaps || plan.swaps.length === 0) {
        return `No rebalancing needed for wallet ${walletLabel}.`;
    }
    const lines: string[] = [];
    lines.push(`Rebalance suggestions for wallet ${walletLabel}`);
    for (const s of plan.swaps) {
        const fromLabel = tokenLabelsById?.[s.fromTokenId] || s.fromTicker || 'Token';
        const toLabel = tokenLabelsById?.[s.toTokenId] || s.toTicker || 'Token';
        const qtyFromStr = typeof s.fromQuantity === 'number' && isFinite(s.fromQuantity) ? ` (~${s.fromQuantity.toFixed(4)} ${fromLabel})` : '';
        const qtyToStr = typeof s.toQuantity === 'number' && isFinite(s.toQuantity) ? ` (~${s.toQuantity.toFixed(4)} ${toLabel})` : '';
        const flag = s.isNeededByThresholds ? 'NEEDED' : 'OPTIONAL';
        lines.push(`- [${flag}] Sell $${s.usdAmount.toFixed(2)} of ${fromLabel}${qtyFromStr} -> buy ${toLabel}${qtyToStr}`);
    }
    lines.push(`Totals: Sell $${plan.totalSellUsd.toFixed(2)}, Buy $${plan.totalBuyUsd.toFixed(2)}`);
    return lines.join('\n');
}


