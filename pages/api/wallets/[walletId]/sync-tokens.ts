import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { syncWalletTokensByAddress } from "../../../../lib/tokenSync";

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
        .select('id, address')
        .eq('id', walletId)
        .single();

    if (wErr || !wallet) return res.status(404).json({ error: 'Wallet not found' });

    try {
        const result = await syncWalletTokensByAddress(wallet.address, { fungibleOnly: true });
        return res.status(200).json({ ok: true, result });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Sync failed';
        return res.status(500).json({ error: message });
    }
}


