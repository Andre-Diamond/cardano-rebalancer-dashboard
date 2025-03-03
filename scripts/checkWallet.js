// ../scripts/checkWallet.js
const { getWalletBalance, sendDiscordNotification } = require("../lib/wallet");
require("dotenv").config();

(async () => {
  try {
    const balance = await getWalletBalance();
    if (balance.rebalanceAmount) {
      await sendDiscordNotification(process.env.DISCORD_WEBHOOK, balance);
      console.log("Discord alert sent.");
    } else {
      console.log("No rebalancing needed.");
    }
  } catch (error) {
    console.error("Error checking wallet balance:", error);
    process.exit(1);
  }
})();
