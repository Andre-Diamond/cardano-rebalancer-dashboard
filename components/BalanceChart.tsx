// ../components/BalanceChart.tsx

import React from "react";
import { WalletBalance } from "../types/wallet";
import styles from "../styles/BalanceChart.module.css";

interface Props {
  balance: WalletBalance;
}

const BalanceChart: React.FC<Props> = ({ balance }) => {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Balance Chart</h2>
      <div className={styles.chart}>
        <p>ADA: {balance.adaPercentage.toFixed(2)}%</p>
        <p>DJED: {balance.djedPercentage.toFixed(2)}%</p>
      </div>
    </div>
  );
};

export default BalanceChart;
