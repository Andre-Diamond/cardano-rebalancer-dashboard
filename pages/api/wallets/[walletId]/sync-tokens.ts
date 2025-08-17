import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { syncWalletTokensByStake } from "../../../../lib/tokenSync";
import { koiosApi } from "../../../../lib/koios";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_PUBLIC_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { walletId } = req.query as { walletId: string };

    const { data: wallet, error: wErr } = await supabase
        .from('wallets')
        .select('id, address, stake_address')
        .eq('id', walletId)
        .single();

    if (wErr || !wallet) return res.status(404).json({ error: 'Wallet not found' });

    try {
        // Ensure stake address is populated
        let stakeAddr: string | null = (wallet as { stake_address?: string | null }).stake_address || null;
        const baseAddr: string | null = (wallet as { address?: string | null }).address || null;
        if (!stakeAddr && baseAddr) {
            try {
                const info = await koiosApi.post('/address_info', { _addresses: [baseAddr] });
                const resolved = Array.isArray(info.data) && info.data[0] && info.data[0].stake_address ? String(info.data[0].stake_address) : null;
                if (resolved) {
                    await supabase.from('wallets').update({ stake_address: resolved }).eq('id', (wallet as { id: string }).id);
                    stakeAddr = resolved;
                }
            } catch {
                // ignore
            }
        }

        if (!stakeAddr) return res.status(400).json({ error: 'Stake address unavailable for wallet' });
        const result = await syncWalletTokensByStake(stakeAddr, { fungibleOnly: true });
        return res.status(200).json({ ok: true, result });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Sync failed';
        return res.status(500).json({ error: message });
    }
}


