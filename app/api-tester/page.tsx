'use client';

import React, { useState } from 'react';

export default function ApiTester() {
    const [token, setToken] = useState('');
    const [response, setResponse] = useState<any>(null);

    // Login State
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // Get Bills State
    const [getYear, setGetYear] = useState('');
    const [getMonth, setGetMonth] = useState('');

    // Add/Edit Bill State
    const [billData, setBillData] = useState({
        id: '', // For Edit
        date: new Date().toISOString().split('T')[0],
        payee: '',
        payAmount: '',
        isPaid: false,
        notes: '',
        payer: '',
        receiveAmount: '',
    });

    const handleLogin = async () => {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            setResponse(data);
            if (res.ok && data.token) {
                setToken(data.token);
                localStorage.setItem('token', data.token); // Optional convenience
            }
        } catch (e: any) {
            setResponse({ error: e.message });
        }
    };

    const handleGetBills = async () => {
        try {
            let url = '/api/bills';
            const params = new URLSearchParams();
            if (getYear) params.append('year', getYear);
            if (getMonth) params.append('month', getMonth);
            if (params.toString()) url += `?${params.toString()}`;

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();
            setResponse(data);
        } catch (e: any) {
            setResponse({ error: e.message });
        }
    };

    const handleAddBill = async () => {
        try {
            const res = await fetch('/api/bills', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...billData,
                    payAmount: billData.payAmount ? parseFloat(billData.payAmount) : undefined,
                    receiveAmount: billData.receiveAmount ? parseFloat(billData.receiveAmount) : undefined,
                }),
            });
            const data = await res.json();
            setResponse(data);
        } catch (e: any) {
            setResponse({ error: e.message });
        }
    };

    const handleEditBill = async () => {
        if (!billData.id) {
            setResponse({ error: 'Bill ID is required for editing' });
            return;
        }
        try {
            const res = await fetch(`/api/bills/${billData.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...billData,
                    payAmount: billData.payAmount ? parseFloat(billData.payAmount) : undefined,
                    receiveAmount: billData.receiveAmount ? parseFloat(billData.receiveAmount) : undefined,
                }),
            });
            const data = await res.json();
            setResponse(data);
        } catch (e: any) {
            setResponse({ error: e.message });
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8 flex gap-8 text-black">
            {/* Left Column: Actions */}
            <div className="w-1/2 flex flex-col gap-6">
                <h1 className="text-2xl font-bold mb-4">API Tester</h1>

                {/* Login Section */}
                <div className="bg-white p-6 rounded-lg shadow space-y-4">
                    <h2 className="text-xl font-semibold">1. Login</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <input
                            placeholder="Username"
                            className="border p-2 rounded"
                            value={username} onChange={e => setUsername(e.target.value)}
                        />
                        <input
                            placeholder="Password"
                            type="password"
                            className="border p-2 rounded"
                            value={password} onChange={e => setPassword(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={handleLogin}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full"
                    >
                        Login & Get Token
                    </button>
                    {token && <p className="text-green-600 text-sm truncate">Token: {token}</p>}
                </div>

                {/* Get Bills Section */}
                <div className="bg-white p-6 rounded-lg shadow space-y-4">
                    <h2 className="text-xl font-semibold">2. Get Bills</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <input
                            placeholder="Year (e.g. 2025)"
                            className="border p-2 rounded"
                            value={getYear} onChange={e => setGetYear(e.target.value)}
                        />
                        <input
                            placeholder="Month (e.g. 12)"
                            className="border p-2 rounded"
                            value={getMonth} onChange={e => setGetMonth(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={handleGetBills}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 w-full"
                    >
                        Fetch Bills
                    </button>
                </div>

                {/* Add/Edit Bill Section */}
                <div className="bg-white p-6 rounded-lg shadow space-y-4">
                    <h2 className="text-xl font-semibold">3. Add / Edit Bill</h2>
                    <input
                        placeholder="Bill ID (Required for Edit)"
                        className="border p-2 rounded w-full"
                        value={billData.id} onChange={e => setBillData({ ...billData, id: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <input
                            type="date"
                            className="border p-2 rounded"
                            value={billData.date} onChange={e => setBillData({ ...billData, date: e.target.value })}
                        />
                        <input
                            placeholder="Payee"
                            className="border p-2 rounded"
                            value={billData.payee} onChange={e => setBillData({ ...billData, payee: e.target.value })}
                        />
                        <input
                            placeholder="Amount"
                            type="number"
                            className="border p-2 rounded"
                            value={billData.payAmount} onChange={e => setBillData({ ...billData, payAmount: e.target.value })}
                        />
                        <label className="flex items-center gap-2 border p-2 rounded">
                            <input
                                type="checkbox"
                                checked={billData.isPaid}
                                onChange={e => setBillData({ ...billData, isPaid: e.target.checked })}
                            />
                            Is Paid?
                        </label>
                        <input
                            placeholder="Notes"
                            className="border p-2 rounded col-span-2"
                            value={billData.notes} onChange={e => setBillData({ ...billData, notes: e.target.value })}
                        />
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={handleAddBill}
                            className="flex-1 bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
                        >
                            Create Bill (POST)
                        </button>
                        <button
                            onClick={handleEditBill}
                            className="flex-1 bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700"
                        >
                            Update Bill (PUT)
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Column: Response */}
            <div className="w-1/2">
                <div className="bg-gray-900 text-green-400 p-6 rounded-lg shadow h-[calc(100vh-4rem)] overflow-auto sticky top-8 font-mono text-sm leading-relaxed">
                    <h2 className="text-white text-lg mb-4 border-b border-gray-700 pb-2">JSON Response</h2>
                    <pre>{response ? JSON.stringify(response, null, 2) : '// Response will appear here...'}</pre>
                </div>
            </div>
        </div>
    );
}
