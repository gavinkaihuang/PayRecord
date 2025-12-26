'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard, GlassInput, GlassButton } from '../components/ui';

export default function UsersPage() {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [newUser, setNewUser] = useState('');
    const [newPass, setNewPass] = useState('');
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');
        if (!token || !userStr) {
            router.push('/login');
            return;
        }
        const user = JSON.parse(userStr);
        // Note: Client side check is weak, API protects data.
        if (user.username !== 'admin') {
            router.push('/dashboard');
            return;
        }
        setIsAdmin(true);
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/users', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
            setUsers(await res.json());
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ username: newUser, password: newPass })
            });
            if (res.ok) {
                setNewUser('');
                setNewPass('');
                fetchUsers();
            } else {
                const d = await res.json();
                setError(d.error || 'Failed to create user');
            }
        } catch (e) {
            setError('Error creating user');
        }
    }

    if (!isAdmin) return null;

    return (
        <div className="min-h-screen p-6 flex flex-col items-center">
            <div className="w-full max-w-4xl">
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-2xl font-bold text-white">User Management</h1>
                    <GlassButton variant="secondary" onClick={() => router.push('/dashboard')}>Back to Dashboard</GlassButton>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* List */}
                    <GlassCard className="p-6">
                        <h2 className="text-lg font-bold mb-4">Existing Users</h2>
                        <ul className="space-y-2">
                            {users.map(u => (
                                <li key={u.id} className="p-3 bg-white/5 rounded-lg flex justify-between">
                                    <span>{u.username}</span>
                                    <span className="text-white/30 text-xs">{new Date(u.createdAt).toLocaleDateString()}</span>
                                </li>
                            ))}
                        </ul>
                    </GlassCard>

                    {/* Create */}
                    <GlassCard className="p-6">
                        <h2 className="text-lg font-bold mb-4">Create New User</h2>
                        {error && <div className="text-red-300 text-sm mb-2 bg-red-500/10 p-2 rounded">{error}</div>}
                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div>
                                <label className="block text-sm text-white/50 mb-1">Username</label>
                                <GlassInput required value={newUser} onChange={e => setNewUser(e.target.value)} className="w-full" />
                            </div>
                            <div>
                                <label className="block text-sm text-white/50 mb-1">Password</label>
                                <GlassInput required type="password" value={newPass} onChange={e => setNewPass(e.target.value)} className="w-full" />
                            </div>
                            <GlassButton type="submit" className="w-full">Create User</GlassButton>
                        </form>
                    </GlassCard>
                </div>
            </div>
        </div>
    );
}
