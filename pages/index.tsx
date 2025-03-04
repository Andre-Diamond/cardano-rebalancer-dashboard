// ../pages/index.tsx
import React from "react";
import { useQuery, useMutation, QueryClient, QueryClientProvider } from "react-query";
import { apiRequest } from "../lib/apiRequest";
import BalanceChart from "../components/BalanceChart";
import BalanceStatus from "../components/BalanceStatus";
import WalletGrowthChart from "../components/WalletGrowthChart";
import WalletSnapshotsTable from "../components/WalletSnapshotsTable";
import Card from "../components/Card";
import Button from "../components/Button";
import Skeleton from "../components/Skeleton";
import toast from "react-hot-toast";
import { WalletBalance } from "../types/wallet";
import styles from "../styles/Dashboard.module.css";

// Create a QueryClient instance
const queryClient = new QueryClient();

const Dashboard = () => {
  const sendAlert = useMutation({
    mutationFn: () =>
      apiRequest("/api/wallet/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      }),
    onSuccess: () => {
      toast.success("Discord alert sent successfully");
    },
    onError: (err) => {
      console.error("Failed to send alert:", err);
      toast.error("Failed to send Discord alert. Please try again later.");
    },
  });

  const { data: balance, isLoading } = useQuery<WalletBalance>("walletBalance", () =>
    apiRequest("/api/wallet/balance", { method: "GET" }), {
      refetchInterval: 600000, // Refresh every 10 minutes
      retry: 1,
      onError: (err) => {
        console.error("Balance fetch error:", err);
        toast.error("Failed to load wallet balance. Please try again later.");
      }
    }
  );

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.gridTwoColumns}>
          <Skeleton className={styles.skeletonBox} />
          <Skeleton className={styles.skeletonBox} />
        </div>
      </div>
    );
  }

  if (!balance) {
    return (
      <div className={styles.container}>
        <Card className={styles.cardPadding}>
          <h2 className={styles.errorHeading}>Error</h2>
          <p>Failed to load wallet balance</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Wallet Monitor</h1>
        <Button onClick={() => sendAlert.mutate()} disabled={sendAlert.isLoading}>
          {sendAlert.isLoading ? "Sending..." : "Send Discord Alert"}
        </Button>
      </div>
      <div className={styles.gridTwoColumns}>
        <BalanceChart balance={balance} />
        <BalanceStatus balance={balance} />
      </div>

      <div className={styles.cardGrid}>
        <Card className={styles.cardPadding}>
          <h2 className={styles.cardHeading}>ADA Balance</h2>
          <div className={styles.balanceDetails}>
            <div className={styles.balanceRow}>
              <span>Amount:</span>
              <span>{balance.ada.amount.toFixed(2)} ADA</span>
            </div>
            <div className={styles.balanceRow}>
              <span>Value:</span>
              <span>${balance.ada.usdValue.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        <Card className={styles.cardPadding}>
          <h2 className={styles.cardHeading}>DJED Balance</h2>
          <div className={styles.balanceDetails}>
            <div className={styles.balanceRow}>
              <span>Amount:</span>
              <span>{balance.djed.amount.toFixed(2)} DJED</span>
            </div>
            <div className={styles.balanceRow}>
              <span>Value:</span>
              <span>${balance.djed.usdValue.toFixed(2)}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className={styles.section}>
        <WalletGrowthChart />
      </div>
      <div className={styles.section}>
        <WalletSnapshotsTable />
      </div>
    </div>
  );
};

const HomePage = () => (
  <QueryClientProvider client={queryClient}>
    <Dashboard />
  </QueryClientProvider>
);

export default HomePage;
