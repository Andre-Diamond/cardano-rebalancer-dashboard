import axios from 'axios';

export async function sendDiscordMessage(content: string, username = 'Cardano Rebalancer') {
    try {
        const webhook = process.env.DISCORD_WEBHOOK || process.env.DISCORD_WEBHOOK_URL || '';
        if (!webhook) return;
        await axios.post(webhook, { content, username });
    } catch {
        // Best-effort: swallow errors to avoid breaking primary flow
    }
}


