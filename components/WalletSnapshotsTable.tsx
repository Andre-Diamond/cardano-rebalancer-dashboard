// components/WalletSnapshotsTable.tsx
import React from "react";
import { useQuery } from "react-query";
import styles from "../styles/WalletSnapshotsTable.module.css";

const WalletSnapshotsTable: React.FC = () => {
  const { data, isLoading, error } = useQuery(
    "walletSnapshots",
    async () => {
      const res = await fetch("/api/wallet/snapshots");
      if (!res.ok) throw new Error("Network error");
      return res.json();
    },
    {
      staleTime: 0, // Data is considered stale immediately
      refetchOnMount: true, // Refetch when component mounts
      refetchOnWindowFocus: true, // Refetch when window regains focus
      refetchInterval: 600000, // Refetch every 10 minutes
      retry: 1,
      onError: (err) => {
        console.error("Error fetching snapshots:", err);
      }
    }
  );

  if (isLoading) return <div>Loading snapshots...</div>;
  if (error) return <div>Error loading snapshots</div>;

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Date</th>
            <th className={styles.th}>ADA Amount</th>
            <th className={styles.th}>DJED Amount</th>
            <th className={styles.th}>Total USD Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((snapshot: { id: string; created_at: string; ada_amount: number; djed_amount: number; total_usd_value: number }) => (
            <tr key={snapshot.id}>
              <td className={styles.td}>
                {new Date(snapshot.created_at).toLocaleString()}
              </td>
              <td className={styles.td}>{snapshot.ada_amount}</td>
              <td className={styles.td}>{snapshot.djed_amount}</td>
              <td className={styles.td}>
                {Number(snapshot.total_usd_value).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default WalletSnapshotsTable;
