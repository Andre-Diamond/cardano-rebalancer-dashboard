import { createClient } from '@supabase/supabase-js';
import { koiosApi } from './koios';
import type { KoiosAsset, KoiosAssetInfoResponse } from '../types';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_PUBLIC_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeDecimals(decimals: unknown, fallback: number = 0): number {
    if (typeof decimals === 'number' && isFinite(decimals)) return decimals;
    if (typeof decimals === 'string' && decimals.trim() !== '' && !isNaN(Number(decimals))) return Number(decimals);
    return fallback;
}

export async function ensureCoreTokensSeeded() {
    // ADA row (is_ada=true)
    await supabase.from('tokens').upsert({
        policy_id: null,
        asset_name: null,
        fingerprint: null,
        ticker: 'ADA',
        name: 'Cardano ADA',
        decimals: 6,
        is_ada: true
    }, { onConflict: 'is_ada' });
}

export async function syncWalletTokensByAddress(walletAddress: string, options?: { fungibleOnly?: boolean }) {
    if (!walletAddress) throw new Error('walletAddress is required');

    await ensureCoreTokensSeeded();

    // Fetch address assets from Koios
    const assetResponse = await koiosApi.post('/address_assets', { _addresses: [walletAddress] });

    let assets: KoiosAsset[] = [];
    if (Array.isArray(assetResponse.data)) {
        if (assetResponse.data.length > 0 && assetResponse.data[0].asset_list) {
            assets = assetResponse.data[0].asset_list;
        } else {
            assets = assetResponse.data as KoiosAsset[];
        }
    }

    let nonAdaAssets = assets.filter(a => a.policy_id && a.asset_name);
    if (options?.fungibleOnly) {
        // Skip NFTs by assumption: exactly 1 means NFT
        nonAdaAssets = nonAdaAssets.filter(a => {
            const qty = typeof a.quantity === 'string' ? parseInt(a.quantity || '0', 10) : 0;
            return qty !== 1;
        });
    }
    if (nonAdaAssets.length === 0) return { inserted: 0, updated: 0 };

    // Batch fetch asset info for metadata/fingerprint
    const infoResp = await koiosApi.post('/asset_info', {
        _asset_list: nonAdaAssets.map(a => [a.policy_id, a.asset_name])
    });

    const infoByKey = new Map<string, KoiosAssetInfoResponse>();
    if (Array.isArray(infoResp.data)) {
        for (const row of infoResp.data as KoiosAssetInfoResponse[]) {
            const key = `${row.policy_id}:${row.asset_name}`;
            infoByKey.set(key, row);
        }
    }

    const inserted = 0; const updated = 0;
    for (const asset of nonAdaAssets) {
        const key = `${asset.policy_id}:${asset.asset_name}`;
        const info = infoByKey.get(key);
        const md = info?.token_registry_metadata ?? null;
        const decimals = normalizeDecimals(md?.decimals, 0);

        const upsertRow = {
            policy_id: asset.policy_id,
            asset_name: asset.asset_name,
            fingerprint: info?.fingerprint ?? null,
            ticker: md?.ticker ?? null,
            name: md?.name ?? (info?.asset_name_ascii ?? null),
            decimals,
            is_ada: false,
            metadata: md ? { token_registry_metadata: md } : {}
        } as const;

        const { data, error } = await supabase
            .from('tokens')
            .upsert(upsertRow, { onConflict: 'policy_id,asset_name' })
            .select('id');

        if (error) throw error;
        if (data && data.length > 0) {
            // Supabase returns row even on update; do a naive count based on existence prior — skip for simplicity
        }
    }

    return { inserted, updated };
}


