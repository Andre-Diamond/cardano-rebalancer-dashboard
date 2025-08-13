import React from 'react';
import { useMutation } from 'react-query';
import toast from 'react-hot-toast';
import { apiRequest } from '../lib/apiRequest';
import type { Wallet } from '../types';
import styles from '../styles/Wallets.module.css';

export default function AddWalletCard({ onAdded }: { onAdded?: () => void }) {
    const [newName, setNewName] = React.useState('');
    const [newAddress, setNewAddress] = React.useState('');

    const addWallet = useMutation({
        mutationFn: (payload: { name: string; address: string }) => apiRequest<Wallet>('/api/wallets', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        }),
        onSuccess: () => {
            toast.success('Wallet added');
            setNewName('');
            setNewAddress('');
            onAdded?.();
        },
        onError: (e: unknown) => {
            toast.error(e instanceof Error ? e.message : 'Failed to add wallet');
        }
    });

    return (
        <div className={styles.card}>
            <h3>Add Wallet</h3>
            <div className={styles.addWalletForm}>
                <input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} className={styles.inputName} />
                <input placeholder="Address" value={newAddress} onChange={e => setNewAddress(e.target.value)} className={styles.inputAddress} />
                <button onClick={() => addWallet.mutate({ name: newName, address: newAddress })} disabled={addWallet.isLoading || !newName || !newAddress}>Add</button>
            </div>
        </div>
    );
}


