import axios from 'axios';

export async function fetchAdaUsd(): Promise<{ price: number; isFallback: boolean }> {
    let adaPrice = 0;
    let isUsingFallbackRate = false;
    try {
        const r1 = await axios.get('https://api.kraken.com/0/public/Ticker?pair=ADAUSD');
        if (r1.data?.result?.ADAUSD?.c?.[0]) adaPrice = parseFloat(r1.data.result.ADAUSD.c[0]);
        if (!adaPrice) {
            const r2 = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd');
            adaPrice = r2.data?.cardano?.usd || 0;
        }
        if (!adaPrice) {
            adaPrice = 0.5;
            isUsingFallbackRate = true;
        }
    } catch {
        adaPrice = 0.5;
        isUsingFallbackRate = true;
    }
    return { price: adaPrice, isFallback: isUsingFallbackRate };
}


