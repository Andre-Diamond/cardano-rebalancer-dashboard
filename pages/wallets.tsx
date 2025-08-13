import React from "react";
import { useData } from "../lib/dataContext";
import type { Wallet } from "../types";
import styles from "../styles/Wallets.module.css";
import AddWalletCard from "../components/AddWalletCard";
import WalletCard from "../components/WalletCard";

function WalletsInner() {
    const { getWallets, refreshWallets } = useData();
    const [wallets, setWallets] = React.useState<Wallet[]>([]);
    React.useEffect(() => {
        getWallets().then(setWallets).catch(() => setWallets([]));
    }, [getWallets]);

    return (
        <div className={styles.container}>
            <h1>Wallets</h1>
            <AddWalletCard onAdded={() => refreshWallets().then(setWallets).catch(() => { })} />
            <h3>Managed Wallets</h3>
            {(wallets ?? []).map((w: Wallet) => (
                <WalletCard key={w.id} wallet={w} />
            ))}
        </div>
    );
}

export default function WalletsPage() {
    return (
        <WalletsInner />
    );
}


