'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GlassButton, GlassInput } from '../components/ui';
import { User, Lock, Send, Shield, Activity, Save, Store, Upload, Image as ImageIcon, Plus, Trash2, Copy } from 'lucide-react';
import { format } from 'date-fns';

export default function SettingsPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'profile' | 'telegram' | 'logs' | 'merchants'>('profile');
    const [isLoading, setIsLoading] = useState(false);

    // Profile State
    const [username, setUsername] = useState('');
    const [userId, setUserId] = useState('');
    const [nickname, setNickname] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Telegram State
    const [telegramToken, setTelegramToken] = useState('');
    const [telegramChatId, setTelegramChatId] = useState('');

    // Logs State
    const [logs, setLogs] = useState<any[]>([]);

    useEffect(() => {
        fetchProfile();
    }, []);

    useEffect(() => {
        if (activeTab === 'logs') {
            fetchLogs();
        }
    }, [activeTab]);

    const fetchProfile = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                router.push('/login');
                return;
            }
            const res = await fetch('/api/users/profile', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsername(data.username);
                setUserId(data.id || '');
                setNickname(data.nickname || '');
                setTelegramToken(data.telegramToken || '');
                setTelegramChatId(data.telegramChatId || '');
            } else {
                if (res.status === 401 || res.status === 404) router.push('/login');
            }
        } catch (error) {
            console.error(error);
        }
    };

    const fetchLogs = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/logs', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLogs(data);
            }
        } catch (error) {
            console.error(error);
        }
    };

    // Merchants State
    const [merchants, setMerchants] = useState<{ name: string, icon: string | null }[]>([]);
    const [isUploadingMerchant, setIsUploadingMerchant] = useState<string | null>(null);
    const [isAddingMerchant, setIsAddingMerchant] = useState(false);
    const [newMerchantName, setNewMerchantName] = useState('');

    const fetchMerchants = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/merchants', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMerchants(data);
            }
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        if (activeTab === 'merchants') {
            fetchMerchants();
        }
    }, [activeTab]);

    const handleUploadIcon = async (merchantName: string, file: File) => {
        setIsUploadingMerchant(merchantName);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const token = localStorage.getItem('token');
            const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (!uploadRes.ok) throw new Error('Upload failed');
            const { url } = await uploadRes.json();

            const saveRes = await fetch('/api/merchants', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name: merchantName, icon: url })
            });

            if (!saveRes.ok) throw new Error('Save failed');
            await fetchMerchants();

        } catch (error) {
            console.error(error);
            alert('Failed to upload icon');
        } finally {
            setIsUploadingMerchant(null);
        }
    };

    const handleAddMerchant = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMerchantName.trim()) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/merchants', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name: newMerchantName.trim(), icon: null })
            });

            if (res.ok) {
                setNewMerchantName('');
                setIsAddingMerchant(false);
                fetchMerchants();
            } else {
                alert('Failed to add merchant');
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleDeleteMerchant = async (name: string) => {
        if (!confirm(`Are you sure you want to delete config for "${name}"? This will reset the icon.`)) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/merchants?name=${encodeURIComponent(name)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                fetchMerchants();
            } else {
                alert('Failed to delete merchant');
            }
        } catch (error) {
            console.error(error);
        }
    };

    const [isTesting, setIsTesting] = useState(false);

    const handleTestTelegram = async () => {
        setIsTesting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/telegram/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ token: telegramToken, chatId: telegramChatId })
            });

            const data = await res.json();
            if (res.ok) {
                alert('Test message sent successfully! Check your Telegram.');
            } else {
                alert(`Failed to send test message: ${data.error}`);
            }
        } catch (error) {
            console.error(error);
            alert('Error sending test message');
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password && password !== confirmPassword) {
            alert("Passwords don't match");
            return;
        }

        setIsLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/users/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    nickname,
                    password: password || undefined,
                    telegramToken,
                    telegramChatId
                })
            });

            if (res.ok) {
                alert('Settings saved successfully');
                setPassword('');
                setConfirmPassword('');
                fetchProfile(); // Refresh data
            } else {
                const data = await res.json();
                alert(`Failed to save settings: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error(error);
            alert('Error saving settings: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsLoading(false);
        }
    };

    const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all ${activeTab === id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
        >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
        </button>
    );

    return (
        <div className="min-h-screen p-8 pt-24 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                    Settings
                </h1>
                <button onClick={() => router.back()} className="text-white/50 hover:text-white transition-colors">
                    Back
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {/* Sidebar Navigation */}
                <div className="glass-panel p-4 h-fit space-y-2">
                    <TabButton id="profile" label="Profile" icon={User} />
                    <TabButton id="telegram" label="Telegram" icon={Send} />
                    <TabButton id="merchants" label="Merchants" icon={Store} />
                    <TabButton id="logs" label="Activity Logs" icon={Activity} />
                </div>

                {/* Main Content */}
                <div className="md:col-span-3 glass-panel p-8 min-h-[500px]">
                    <form onSubmit={handleSave}>
                        {activeTab === 'profile' && (
                            <div className="space-y-6 animate-fadeIn">
                                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-indigo-400" />
                                    Profile Information
                                </h2>

                                <div>
                                    <label className="block text-sm text-white/50 mb-2">User ID (for Calendar Subscription)</label>
                                    <div className="flex gap-2 max-w-md">
                                        <GlassInput
                                            value={userId}
                                            readOnly
                                            className="w-full opacity-80 cursor-default font-mono text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (navigator.clipboard) {
                                                    navigator.clipboard.writeText(userId)
                                                        .then(() => alert('User ID copied to clipboard'))
                                                        .catch(console.error);
                                                } else {
                                                    // Fallback for older browsers or non-secure contexts
                                                    const textArea = document.createElement("textarea");
                                                    textArea.value = userId;
                                                    document.body.appendChild(textArea);
                                                    textArea.focus();
                                                    textArea.select();
                                                    try {
                                                        document.execCommand('copy');
                                                        alert('User ID copied to clipboard');
                                                    } catch (err) {
                                                        console.error('Fallback copy failed', err);
                                                    }
                                                    document.body.removeChild(textArea);
                                                }
                                            }}
                                            className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 transition-colors flex items-center gap-2"
                                            title="Copy ID"
                                        >
                                            <Copy className="w-4 h-4" />
                                            <span className="sr-only">Copy</span>
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm text-white/50 mb-2">Username</label>
                                    <GlassInput
                                        value={username}
                                        disabled
                                        className="w-full max-w-md opacity-60 cursor-not-allowed"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm text-white/50 mb-2">Nickname</label>
                                    <GlassInput
                                        value={nickname}
                                        onChange={e => setNickname(e.target.value)}
                                        placeholder="Display Name"
                                        className="w-full max-w-md"
                                    />
                                </div>

                                <div className="border-t border-white/10 pt-6">
                                    <h3 className="text-sm font-medium text-white/80 mb-4">Change Password</h3>
                                    <div className="grid gap-4 max-w-md">
                                        <div>
                                            <label className="block text-sm text-white/50 mb-2">New Password</label>
                                            <GlassInput
                                                type="password"
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                placeholder="Leave blank to keep current"
                                                className="w-full"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-white/50 mb-2">Confirm Password</label>
                                            <GlassInput
                                                type="password"
                                                value={confirmPassword}
                                                onChange={e => setConfirmPassword(e.target.value)}
                                                placeholder="Confirm new password"
                                                className="w-full"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6">
                                    <GlassButton type="submit" disabled={isLoading}>
                                        {isLoading ? 'Saving...' : 'Save Changes'}
                                    </GlassButton>
                                </div>
                            </div>
                        )}

                        {activeTab === 'telegram' && (
                            <div className="space-y-6 animate-fadeIn">
                                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                    <Send className="w-5 h-5 text-blue-400" />
                                    Telegram Integration
                                </h2>
                                <p className="text-white/50 text-sm mb-6">
                                    Configure your Telegram bot to receive notifications.
                                </p>

                                <div className="space-y-4 max-w-xl">
                                    <div>
                                        <label className="block text-sm text-white/50 mb-2">Bot Token</label>
                                        <GlassInput
                                            value={telegramToken}
                                            onChange={e => setTelegramToken(e.target.value)}
                                            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                                            className="w-full font-mono text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-white/50 mb-2">Chat ID</label>
                                        <GlassInput
                                            value={telegramChatId}
                                            onChange={e => setTelegramChatId(e.target.value)}
                                            placeholder="12345678"
                                            className="w-full font-mono text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="pt-6 flex gap-4">
                                    <GlassButton type="submit" disabled={isLoading}>
                                        <div className="flex items-center gap-2">
                                            <Save className="w-4 h-4" />
                                            {isLoading ? 'Saving...' : 'Save Configuration'}
                                        </div>
                                    </GlassButton>

                                    <button
                                        type="button"
                                        onClick={handleTestTelegram}
                                        disabled={isTesting || !telegramToken || !telegramChatId}
                                        className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${isTesting || !telegramToken || !telegramChatId
                                            ? 'bg-white/5 text-white/30 cursor-not-allowed'
                                            : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                                            }`}
                                    >
                                        <Send className="w-4 h-4" />
                                        {isTesting ? 'Sending...' : 'Test Configuration'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </form>

                    {activeTab === 'logs' && (
                        <div className="space-y-6 animate-fadeIn">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-green-400" />
                                System Activity Logs
                            </h2>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-white/10 text-white/50 text-sm">
                                            <th className="py-3 px-2 font-medium">Time</th>
                                            <th className="py-3 px-2 font-medium">Action</th>
                                            <th className="py-3 px-2 font-medium">Details</th>
                                            <th className="py-3 px-2 font-medium">IP</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        {logs.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="py-8 text-center text-white/30">
                                                    No activity logs found.
                                                </td>
                                            </tr>
                                        ) : (
                                            logs.map((log) => (
                                                <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                    <td className="py-3 px-2 text-white/70 whitespace-nowrap">
                                                        {format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                                                    </td>
                                                    <td className="py-3 px-2 text-indigo-300 font-medium">{log.action}</td>
                                                    <td className="py-3 px-2 text-white/60 truncate max-w-xs" title={log.details}>
                                                        {log.details || '-'}
                                                    </td>
                                                    <td className="py-3 px-2 text-white/40 font-mono text-xs">
                                                        {log.ip || '-'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'merchants' && (
                        <div className="space-y-6 animate-fadeIn">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                <Store className="w-5 h-5 text-purple-400" />
                                Merchant Icons
                            </h2>
                            <p className="text-white/50 text-sm mb-6">
                                Manage icons for your Payees and Payers.
                            </p>

                            <div className="flex justify-end">
                                {isAddingMerchant ? (
                                    <form onSubmit={handleAddMerchant} className="flex gap-2 animate-fadeIn">
                                        <GlassInput
                                            value={newMerchantName}
                                            onChange={e => setNewMerchantName(e.target.value)}
                                            placeholder="Merchant Name"
                                            className="w-48"
                                            autoFocus
                                        />
                                        <GlassButton type="submit">Add</GlassButton>
                                        <button
                                            type="button"
                                            onClick={() => setIsAddingMerchant(false)}
                                            className="text-white/50 hover:text-white px-2"
                                        >
                                            Cancel
                                        </button>
                                    </form>
                                ) : (
                                    <button
                                        onClick={() => setIsAddingMerchant(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 text-indigo-300 rounded-lg hover:bg-indigo-600/30 transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                        <span>Add Merchant</span>
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {merchants.map((merchant) => (
                                    <div key={merchant.name} className="glass-panel p-4 flex items-center justify-between group hover:bg-white/5 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center overflow-hidden border border-white/10">
                                                {merchant.icon ? (
                                                    <img src={merchant.icon} alt={merchant.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-lg text-white/30">{merchant.name[0].toUpperCase()}</span>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="font-medium text-white/90">{merchant.name}</h3>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <input
                                                    type="file"
                                                    id={`upload-${merchant.name}`}
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={(e) => e.target.files?.[0] && handleUploadIcon(merchant.name, e.target.files[0])}
                                                />
                                                <label
                                                    htmlFor={`upload-${merchant.name}`}
                                                    className={`p-2 rounded-lg cursor-pointer transition-colors flex items-center gap-2 ${merchant.icon ? 'text-white/30 hover:text-white hover:bg-white/10' : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
                                                        }`}
                                                >
                                                    {isUploadingMerchant === merchant.name ? (
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Upload className="w-4 h-4" />
                                                            <span className="text-sm">{merchant.icon ? 'Change' : 'Upload'}</span>
                                                        </>
                                                    )}
                                                </label>
                                            </div>

                                            <button
                                                onClick={() => handleDeleteMerchant(merchant.name)}
                                                className="p-2 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                title="Reset/Delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
