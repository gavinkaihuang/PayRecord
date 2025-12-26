'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard, GlassButton } from '../components/ui';
import BillModal from './BillModal';

interface Bill {
    id: string;
    date: string;
    payee?: string;
    payAmount?: number;
    isPaid: boolean;
    paidDate?: string;
    payer?: string;
    receiveAmount?: number;
    actualReceiveAmount?: number;
    notes?: string;
    isRecurring: boolean;
}

export default function Dashboard() {
    const router = useRouter();
    const [user, setUser] = useState<{ username: string } | null>(null);
    const [year, setYear] = useState(new Date().getFullYear());
    // Month is 1-indexed for the API/common usage? API expects 1-12 usually. 
    // Date().getMonth() is 0-11. Let's use 1-12 for state.
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [bills, setBills] = useState<Bill[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBill, setEditingBill] = useState<Bill | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/login');
            return;
        }
        const userData = localStorage.getItem('user');
        if (userData) setUser(JSON.parse(userData));
        fetchBills();
    }, [year, month]);

    const fetchBills = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/bills?year=${year}&month=${month}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setBills(await res.json());
            } else if (res.status === 401) {
                router.push('/login');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    const handleClone = async () => {
        if (!confirm('Clone bills from this month to the next month?')) return;

        // Logic: Current view is Source. We clone TO next month.
        // Wait, usually "Clone" button on "Current Month" means "Clone THIS content to NEXT"? 
        // Or "Clone FROM previous"?
        // User req: "在用户主页面提供克隆按钮，将本月的账单模版克隆到下月使用。"
        // "Clone THIS month's template to connect to NEXT month usage."
        // So if I am viewing Dec 2025, and click Clone, it creates Jan 2026.
        // Yes.

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/bills/clone', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ year, month })
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Successfully cloned ${data.clonedCount} bills to next month.`);
                // Optionally switch to next month
                if (month === 12) {
                    setYear(y => y + 1);
                    setMonth(1);
                } else {
                    setMonth(m => m + 1);
                }
            } else {
                alert('Failed to clone bills');
            }
        } catch (e) {
            alert('Error cloning bills');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this bill?')) return;
        try {
            const token = localStorage.getItem('token');
            await fetch(`/api/bills/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchBills();
        } catch (e) {
            console.error(e);
        }
    }

    const openAddModal = () => {
        setEditingBill(null);
        setIsModalOpen(true);
    }

    const openEditModal = (bill: Bill) => {
        setEditingBill(bill);
        setIsModalOpen(true);
    }

    // Calculate totals
    const totalPay = bills.reduce((sum, b) => sum + (b.payAmount || 0), 0);
    const totalReceive = bills.reduce((sum, b) => sum + (b.receiveAmount || 0), 0);
    const totalActualPay = bills.filter(b => b.isPaid).reduce((sum, b) => sum + (b.payAmount || 0), 0);

    return (
        <div className="min-h-screen p-6 pb-20">
            {/* Header */}
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-pink-400">
                    PayRecord
                </h1>
                <div className="flex items-center gap-4">
                    <span className="text-white/70">Hi, {user?.username}</span>
                    <button onClick={() => router.push('/settings')} className="text-white/50 hover:text-white transition-colors">Settings</button>
                    {user?.username === 'admin' && (
                        <GlassButton className="text-sm px-3 py-1" onClick={() => router.push('/users')}>Users</GlassButton>
                    )}
                    <button onClick={handleLogout} className="text-white/50 hover:text-white transition-colors">Logout</button>
                </div>
            </header>

            {/* Controls */}
            <div className="flex flex-wrap gap-4 items-center justify-between mb-8">
                <div className="flex items-center gap-4 glass-panel px-4 py-2">
                    <button onClick={() => setYear(year - 1)} className="text-white/50 hover:text-white">&lt;</button>
                    <span className="font-bold">{year}</span>
                    <button onClick={() => setYear(year + 1)} className="text-white/50 hover:text-white">&gt;</button>

                    <div className="w-px h-6 bg-white/10 mx-2"></div>

                    <button onClick={() => setMonth(m => m === 1 ? 12 : m - 1)} className="text-white/50 hover:text-white">&lt;</button>
                    <span className="font-bold w-20 text-center">{new Date(0, month - 1).toLocaleString('default', { month: 'long' })}</span>
                    <button onClick={() => setMonth(m => m === 12 ? 1 : m + 1)} className="text-white/50 hover:text-white">&gt;</button>
                </div>

                <div className="flex gap-4">
                    <GlassButton variant="secondary" onClick={handleClone}>Clone to Next Month</GlassButton>
                    <GlassButton onClick={openAddModal}>+ Add Bill</GlassButton>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <GlassCard className="p-6">
                    <h3 className="text-white/50 text-sm font-medium mb-1">Pending Pay</h3>
                    <p className="text-2xl font-bold text-white">¥ {totalPay.toFixed(2)}</p>
                </GlassCard>
                <GlassCard className="p-6">
                    <h3 className="text-white/50 text-sm font-medium mb-1">Paid</h3>
                    <p className="text-2xl font-bold text-green-400">¥ {totalActualPay.toFixed(2)}</p>
                </GlassCard>
                <GlassCard className="p-6">
                    <h3 className="text-white/50 text-sm font-medium mb-1">Receivables</h3>
                    <p className="text-2xl font-bold text-blue-400">¥ {totalReceive.toFixed(2)}</p>
                </GlassCard>
            </div>

            {/* Bill List */}
            <GlassCard className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/5">
                                <th className="p-4 font-medium text-white/70">Date</th>
                                <th className="p-4 font-medium text-white/70">Payee</th>
                                <th className="p-4 font-medium text-white/70">Amount</th>
                                <th className="p-4 font-medium text-white/70">Status</th>
                                <th className="p-4 font-medium text-white/70">Payer (In)</th>
                                <th className="p-4 font-medium text-white/70">Amount (In)</th>
                                <th className="p-4 font-medium text-white/70">Notes</th>
                                <th className="p-4 font-medium text-white/70">Recurring</th>
                                <th className="p-4 font-medium text-white/70 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9} className="p-8 text-center text-white/30">Loading...</td></tr>
                            ) : bills.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-white/30">No bills for this month</td></tr>
                            ) : (
                                bills.map(bill => (
                                    <tr key={bill.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="p-4">{new Date(bill.date).toLocaleDateString()}</td>
                                        <td className="p-4">{bill.payee || '-'}</td>
                                        <td className="p-4">{bill.payAmount ? `¥ ${bill.payAmount}` : '-'}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs ${bill.isPaid ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                                                {bill.isPaid ? 'Paid' : 'Pending'}
                                            </span>
                                        </td>
                                        <td className="p-4">{bill.payer || '-'}</td>
                                        <td className="p-4">{bill.receiveAmount ? `¥ ${bill.receiveAmount}` : '-'}</td>
                                        <td className="p-4 max-w-xs truncate" title={bill.notes || ''}>{bill.notes || '-'}</td>
                                        <td className="p-4 text-center">{bill.isRecurring ? 'Yes' : 'No'}</td>
                                        <td className="p-4 text-right space-x-2">
                                            <button onClick={() => openEditModal(bill)} className="text-indigo-400 hover:text-indigo-300">Edit</button>
                                            <button onClick={() => handleDelete(bill.id)} className="text-red-400 hover:text-red-300">Del</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </GlassCard>

            {isModalOpen && (
                <BillModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    book={editingBill}
                    year={year} // Default for new
                    month={month} // Default for new
                    onSuccess={fetchBills}
                />
            )}
        </div>
    );
}
