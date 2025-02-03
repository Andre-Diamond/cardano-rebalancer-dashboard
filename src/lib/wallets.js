// lib/wallets.js
import fetch from 'node-fetch';

const KOIOS_API_KEY = process.env.KOIOS_API_KEY;
const KOIOS_BASE_URL = process.env.KOIOS_BASE_URL || 'https://api.koios.rest/api/v1';

/**
 * Fetch the wallet balance from Koios.
 * Koios's `/address_info` endpoint returns an array where the first element contains the details.
 * - `balance` is in lovelace (1 ADA = 1e6 lovelace).
 * - `assets` is an array containing native assets; we’ll look for DJED by its asset ID.
 */
export async function fetchWalletBalance(address) {
  const res = await fetch(`${KOIOS_BASE_URL}/address_info?address=${address}`, {
    headers: {
      'Content-Type': 'application/json',
      'project_id': KOIOS_API_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`Error fetching balance for ${address}: ${res.statusText}`);
  }
  const data = await res.json();
  if (!data || data.length === 0) {
    throw new Error(`No data returned for ${address}`);
  }

  const walletData = data[0];

  // Convert lovelace to ADA.
  const adaAmount = walletData.balance ? Number(walletData.balance) / 1e6 : 0;

  // Look for DJED asset. Replace 'djed_unit' with the actual asset identifier for DJED.
  const djedAsset = walletData.assets?.find(asset => asset.asset_id === 'djed_unit');
  const djedAmount = djedAsset ? Number(djedAsset.quantity) : 0;

  return { ada: adaAmount, djed: djedAmount };
}

/**
 * Fetch balances for all wallets defined in the environment variable.
 */
export async function fetchAllWalletBalances() {
  const wallets = JSON.parse(process.env.NEXT_PUBLIC_WALLETS_JSON);
  const results = await Promise.all(
    wallets.map(async (wallet) => {
      const balance = await fetchWalletBalance(wallet.address);
      return { ...wallet, ...balance };
    })
  );

  // Aggregate the totals across wallets.
  const totalADA = results.reduce((sum, wallet) => sum + wallet.ada, 0);
  const totalDJED = results.reduce((sum, wallet) => sum + wallet.djed, 0);

  return { wallets: results, totalADA, totalDJED };
}
