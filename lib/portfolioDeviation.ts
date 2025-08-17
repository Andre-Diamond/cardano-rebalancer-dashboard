import type { SupabaseClient } from '@supabase/supabase-js';
import type { SnapshotHolding, WalletInfo, WalletPortfolioTargetRow } from '../types';
import { sendDiscordMessage } from './discord';

type LocalWalletInfo = { id: string; name?: string | null; threshold_percent?: number | null; config?: Record<string, unknown> | null };

export async function notifyIfDeviationsExceedThreshold(
    supabase: SupabaseClient,
    wallet: LocalWalletInfo | WalletInfo,
    holdings: SnapshotHolding[],
    totalUsdValue: number
) {
    try {
        if (!totalUsdValue || totalUsdValue <= 0) return;
        const walletId = wallet.id;
        const globalThreshold = typeof wallet.threshold_percent === 'number' ? wallet.threshold_percent : 10;
        const cfg = (wallet as { config?: Record<string, unknown> | null }).config || null;
        const thresholdsByTokenId = (cfg && typeof cfg === 'object' && (cfg as Record<string, unknown>).thresholds_by_token_id && typeof (cfg as Record<string, unknown>).thresholds_by_token_id === 'object')
            ? ((cfg as Record<string, unknown>).thresholds_by_token_id as Record<string, number>)
            : {};

        const { data: targets, error } = await supabase
            .from('wallet_portfolio_targets')
            .select('token_id, target_weight_percent, tokens ( ticker, name, is_ada )')
            .eq('wallet_id', walletId);
        if (error || !Array.isArray(targets)) return;
        const typedTargets = (targets as unknown as WalletPortfolioTargetRow[]) ?? [];

        const usdByTokenId = new Map<string, number>();
        for (const h of holdings || []) {
            if (h && h.token_id) {
                usdByTokenId.set(h.token_id, (usdByTokenId.get(h.token_id) || 0) + (Number(h.usd_value) || 0));
            }
        }

        const deviations: Array<{ label: string; actualPct: number; targetPct: number; delta: number }> = [];
        for (const t of typedTargets) {
            const tokenId = t.token_id;
            const targetPct = Number(t.target_weight_percent) || 0;
            const usd = usdByTokenId.get(tokenId) || 0;
            const actualPct = (usd / totalUsdValue) * 100;
            const delta = Math.abs(actualPct - targetPct);
            const thresholdForToken = (thresholdsByTokenId && typeof thresholdsByTokenId[tokenId] === 'number') ? Number(thresholdsByTokenId[tokenId]) : globalThreshold;
            if (delta > thresholdForToken) {
                const tok = t.tokens;
                const label = tok?.ticker || (tok?.is_ada ? 'ADA' : (tok?.name || 'Token'));
                deviations.push({ label, actualPct, targetPct, delta });
            }
        }

        if (deviations.length === 0) return;

        const sorted = deviations.sort((a, b) => b.delta - a.delta);
        const lines = sorted.map(d => `- ${d.label}: actual ${d.actualPct.toFixed(2)}% vs target ${d.targetPct.toFixed(2)}% (delta ${d.delta.toFixed(2)}%)`);
        const header = `Portfolio deviation alert for wallet ${wallet.name || walletId}`;
        const body = [
            header,
            `Global threshold: ${globalThreshold.toFixed(2)}%`,
            `Total USD value: $${totalUsdValue.toFixed(2)}`,
            '',
            ...lines
        ].join('\n');
        await sendDiscordMessage(body);
    } catch {
        // Ignore notifier failures completely
    }
}


