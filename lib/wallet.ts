import axios from "axios";
import { type WalletBalance } from "../types/wallet";

interface Asset {
  policy_id: string;
  asset_name: string;
  quantity: string;
}

// Correct DJED token identifiers for mainnet
const DJED_POLICY_ID = "8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61";
const DJED_ASSET_NAME = "446a65644d6963726f555344";

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
    //console.log(`Fetching ADA balance for address: ${address}`);
    // Fetch ADA balance
    const adaResponse = await koiosApi.post('/address_info', {
      _addresses: [address]
    });
    const adaAmount = parseInt(adaResponse.data[0]?.balance || "0") / 1000000;

    //console.log(`Fetching DJED balance for address: ${address}`);
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

    /*console.log('Looking for DJED token among assets:',
      assets.map(a => ({
        policy_id: a.policy_id,
        asset_name: a.asset_name,
        quantity: a.quantity
      }))
    );*/

    const djedToken = assets.find(
      (asset: Asset) =>
        asset.policy_id === DJED_POLICY_ID &&
        asset.asset_name === DJED_ASSET_NAME
    );
    //console.log('Found DJED token:', djedToken);

    const djedAmount = djedToken ? parseInt(djedToken.quantity) / Math.pow(10, 6) : 0;
    //console.log('Calculated DJED amount:', djedAmount);

    const priceResponse = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd");
    const adaPrice = priceResponse.data.cardano.usd;
    const djedPrice = 1; // DJED is pegged to USD

    const adaUsdValue = adaAmount * adaPrice;
    const djedUsdValue = djedAmount * djedPrice;
    const totalUsdValue = adaUsdValue + djedUsdValue;

    if (totalUsdValue === 0) {
      return {
        ada: { amount: 0, usdValue: 0 },
        djed: { amount: 0, usdValue: 0 },
        totalUsdValue: 0,
        adaPercentage: 0,
        djedPercentage: 0,
        threshold: 10,
        rebalanceAmount: undefined
      };
    }

    const adaPercentage = (adaUsdValue / totalUsdValue) * 100;
    const djedPercentage = (djedUsdValue / totalUsdValue) * 100;
    const threshold = 10;

    // Always compute the "real" rebalance amount
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

    // Return the computed rebalance amount if forced or if the deviation exceeds the threshold
    const isThresholdMet = Math.abs(50 - adaPercentage) > threshold;
    const rebalanceAmount = (force || isThresholdMet) ? computedRebalanceAmount : undefined;

    return {
      ada: { amount: adaAmount, usdValue: adaUsdValue },
      djed: { amount: djedAmount, usdValue: djedUsdValue },
      totalUsdValue,
      adaPercentage,
      djedPercentage,
      threshold,
      rebalanceAmount
    };
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

