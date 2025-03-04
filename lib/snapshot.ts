// lib/snapshot.ts

import { createClient } from '@supabase/supabase-js';
import type { WalletBalance } from "../types/wallet";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_PUBLIC_KEY || ''; 
const supabase = createClient(supabaseUrl, supabaseKey);

export async function saveWalletSnapshotIfChanged(balance: WalletBalance) {
  // Query the most recent snapshot
  const { data, error } = await supabase
    .from('wallet_snapshots')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error fetching last snapshot:", error);
    return;
  }

  const lastSnapshot = data && data[0];

  // Compare token amounts (if last snapshot exists)
  if (
    lastSnapshot &&
    parseFloat(lastSnapshot.ada_amount) === balance.ada.amount &&
    parseFloat(lastSnapshot.djed_amount) === balance.djed.amount
  ) {
    // No change in token amounts; no new snapshot needed.
    return;
  }

  // Compute the total USD value
  const totalUsdValue = Number((balance.ada.usdValue + balance.djed.usdValue).toFixed(2));

  // Insert a new snapshot
  const { error: insertError } = await supabase
    .from('wallet_snapshots')
    .insert([
      {
        ada_amount: balance.ada.amount,
        djed_amount: balance.djed.amount,
        total_usd_value: totalUsdValue,
      },
    ]);

  if (insertError) {
    console.error("Error inserting wallet snapshot:", insertError);
  } else {
    console.log("Wallet snapshot saved successfully");
  }
}
