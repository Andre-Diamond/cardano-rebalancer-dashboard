// ../components/BalanceStatus.tsx

import React from "react";
import { WalletBalance } from "../types/wallet";
import styles from "../styles/BalanceStatus.module.css";

interface Props {
  balance: WalletBalance;
}

const BalanceStatus: React.FC<Props> = ({ balance }) => {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Balance Status</h2>
      {balance.rebalanceAmount ? (
        <p className={styles.message}>
          Swap {balance.rebalanceAmount.amount.toFixed(2)} {balance.rebalanceAmount.from} 
          (≈${balance.rebalanceAmount.usdValue.toFixed(2)}) to{" "}
          {balance.rebalanceAmount.from === "ADA" ? "DJED" : "ADA"}
        </p>
      ) : (
        <p className={styles.message}>Balance is within threshold</p>
      )}
    </div>
  );
};

export default BalanceStatus;
