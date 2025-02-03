// lib/monitor.js
import { fetchAllWalletBalances } from './wallets';

// Function to fetch ADA price in USD using CoinGecko.
async function fetchADAPrice() {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd'
  );
  if (!res.ok) {
    throw new Error(`Error fetching ADA price: ${res.statusText}`);
  }
  const data = await res.json();
  return data.cardano.usd;
}

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Utility function to send a message to Discord via webhook.
async function sendDiscordMessage(content) {
  await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

/**
 * Checks the current portfolio allocation and sends a Discord alert if the USD value of ADA
 * deviates more than 10% from a 50/50 target compared to DJED.
 */
export async function checkThresholdAndNotify() {
  try {
    // Fetch total balances from all wallets.
    const { totalADA, totalDJED } = await fetchAllWalletBalances();

    // Fetch current ADA price in USD.
    const adaPriceUSD = await fetchADAPrice();

    // Calculate USD values.
    const adaValueUSD = totalADA * adaPriceUSD;
    // Assuming DJED is pegged 1:1 to USD.
    const djedValueUSD = totalDJED;

    const totalPortfolioUSD = adaValueUSD + djedValueUSD;
    if (totalPortfolioUSD === 0) return; // avoid division by zero

    // Determine the percentage allocation.
    const adaPercentage = (adaValueUSD / totalPortfolioUSD) * 100;
    const djedPercentage = (djedValueUSD / totalPortfolioUSD) * 100;

    // Check if ADA's allocation is outside 45%-55%.
    if (adaPercentage > 55 || adaPercentage < 45) {
      const message = `Threshold Alert!
ADA: $${adaValueUSD.toFixed(2)} (~${adaPercentage.toFixed(1)}%)
DJED: $${djedValueUSD.toFixed(2)} (~${djedPercentage.toFixed(1)}%)
Time: ${new Date().toLocaleString()}`;
      await sendDiscordMessage(message);
      return { thresholdBreached: true, message };
    }
    return { thresholdBreached: false };
  } catch (error) {
    console.error('Error in threshold check:', error);
    return { thresholdBreached: false, error: error.message };
  }
}
