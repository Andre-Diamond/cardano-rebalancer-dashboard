// ../lib/wallet.ts

import axios from "axios";
import { type WalletBalance } from "../types/wallet";
import { saveWalletSnapshotIfChanged } from "../lib/snapshot";

interface Asset {
  policy_id: string;
  asset_name: string;
  quantity: string;
}

// Correct DJED token identifiers for mainnet
const DJED_POLICY_ID = "8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61";
const DJED_ASSET_NAME = "446a65644d6963726f555344";

async function fetchAdaExchangeRate() {
  try {
    const response = await axios.get('https://api.kraken.com/0/public/Ticker?pair=ADAUSD');
    console.log('Kraken API Response:', response.data);
    if (response.data.result && response.data.result.ADAUSD) {
      return parseFloat(response.data.result.ADAUSD.c[0]);
    }
  } catch (error) {
    console.error('Error fetching from Kraken:', error);
  }
  return 0;
}

const koiosApi = axios.create({
  baseURL: 'https://api.koios.rest/api/v1',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.KOIOS_API_KEY}`
  }
});

export async function getWalletBalance(
  address: string = process.env.WALLET_ADDRESS || "",
  force: boolean = false
): Promise<WalletBalance> {
  try {
    // Fetch ADA balance
    const adaResponse = await koiosApi.post('/address_info', {
      _addresses: [address]
    });
    const adaAmount = parseInt(adaResponse.data[0]?.balance || "0") / 1000000;

    // Fetch DJED balance
    const assetResponse = await koiosApi.post('/address_assets', {
      _addresses: [address]
    });

    let assets: Asset[] = [];
    if (Array.isArray(assetResponse.data)) {
      if (assetResponse.data.length > 0 && assetResponse.data[0].asset_list) {
        assets = assetResponse.data[0].asset_list;
      } else {
        assets = assetResponse.data;
      }
    }

    const djedToken = assets.find(
      (asset: Asset) =>
        asset.policy_id === DJED_POLICY_ID &&
        asset.asset_name === DJED_ASSET_NAME
    );
    const djedAmount = djedToken ? parseInt(djedToken.quantity) / Math.pow(10, 6) : 0;

    let adaPrice = 0;
    let isUsingFallbackRate = false;
    try {
      // Try Kraken API first
      adaPrice = await fetchAdaExchangeRate();

      // If Kraken fails, try CoinGecko
      if (!adaPrice) {
        const priceResponse = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd");
        adaPrice = priceResponse.data.cardano.usd;
      }

      // If both APIs fail, use fallback
      if (!adaPrice) {
        console.warn('Failed to fetch ADA price from both Kraken and CoinGecko, using fallback value');
        adaPrice = 0.5; // Fallback value in USD
        isUsingFallbackRate = true;
      }
    } catch (error: unknown) {
      console.warn('Failed to fetch ADA price from all sources, using fallback value:', error instanceof Error ? error.message : 'Unknown error');
      adaPrice = 0.5; // Fallback value in USD
      isUsingFallbackRate = true;
    }
    const djedPrice = 1; // DJED is pegged to USD

    const adaUsdValue = adaAmount * adaPrice;
    const djedUsdValue = djedAmount * djedPrice;
    const totalUsdValue = adaUsdValue + djedUsdValue;

    if (totalUsdValue === 0) {
      const emptyBalance: WalletBalance = {
        ada: { amount: 0, usdValue: 0 },
        djed: { amount: 0, usdValue: 0 },
        totalUsdValue: 0,
        adaPercentage: 0,
        djedPercentage: 0,
        threshold: 10,
        rebalanceAmount: undefined,
        isUsingFallbackRate: false
      };
      // Save snapshot for zero balance (if needed) and return.
      await saveWalletSnapshotIfChanged(emptyBalance);
      return emptyBalance;
    }

    const adaPercentage = (adaUsdValue / totalUsdValue) * 100;
    const djedPercentage = (djedUsdValue / totalUsdValue) * 100;
    const threshold = 10;

    // Compute the rebalance amount based on deviation from a 50/50 split.
    const targetUsd = totalUsdValue / 2;
    const computedRebalanceAmount =
      adaUsdValue > djedUsdValue
        ? {
          from: 'ADA' as const,
          amount: (adaUsdValue - targetUsd) / adaPrice,
          usdValue: adaUsdValue - targetUsd
        }
        : {
          from: 'DJED' as const,
          amount: djedUsdValue - targetUsd,
          usdValue: djedUsdValue - targetUsd
        };

    // Determine whether to trigger a rebalance alert.
    const isThresholdMet = Math.abs(50 - adaPercentage) > threshold;
    const rebalanceAmount = (force || isThresholdMet) ? computedRebalanceAmount : undefined;

    // Prepare the wallet balance object.
    const walletBalance: WalletBalance = {
      ada: { amount: adaAmount, usdValue: adaUsdValue },
      djed: { amount: djedAmount, usdValue: djedUsdValue },
      totalUsdValue,
      adaPercentage,
      djedPercentage,
      threshold,
      rebalanceAmount,
      isUsingFallbackRate
    };

    // Execute snapshot update to check if the wallet state has changed.
    await saveWalletSnapshotIfChanged(walletBalance);

    return walletBalance;
  } catch (error) {
    console.error('Error in getWalletBalance:', error);
    throw error;
  }
}

export async function sendDiscordNotification(
  webhookUrl: string = process.env.DISCORD_WEBHOOK || "",
  balance: WalletBalance
) {
  if (!balance.rebalanceAmount) return; // If for some reason it's still undefined, nothing will be sent

  const { from, amount, usdValue } = balance.rebalanceAmount;
  const message = {
    embeds: [{
      title: "⚠️ Wallet Balance Alert",
      description: "Portfolio balance has deviated from 50/50 target",
      color: 0xff9900,
      fields: [
        {
          name: "Current Split",
          value: `ADA: ${balance.adaPercentage.toFixed(2)}%\nDJED: ${balance.djedPercentage.toFixed(2)}%`,
          inline: true
        },
        {
          name: "Rebalancing Required",
          value: `Swap ${amount.toFixed(2)} ${from} (≈$${usdValue.toFixed(2)}) to ${from === 'ADA' ? 'DJED' : 'ADA'}`,
          inline: true
        },
        {
          name: "Exchange Rate Status",
          value: balance.isUsingFallbackRate ? "⚠️ Using fallback ADA price ($0.50)" : "✅ Using real-time ADA price",
          inline: false
        }
      ],
      timestamp: new Date().toISOString()
    }]
  };

  try {
    console.log("Sending Discord alert...");
    await axios.post(webhookUrl, message);
    console.log('Discord rebalance notification sent successfully');
  } catch (error) {
    console.error("Failed to send Discord notification:", error);
  }
}

