'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GlassButton, GlassInput } from '../components/ui';
import { User, Lock, Send, Shield, Activity, Save } from 'lucide-react';
import { format } from 'date-fns';

export default function SettingsPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'profile' | 'telegram' | 'logs'>('profile');
    const [isLoading, setIsLoading] = useState(false);

    // Profile State
    const [username, setUsername] = useState('');
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
                setNickname(data.nickname || '');
                setTelegramToken(data.telegramToken || '');
                setTelegramChatId(data.telegramChatId || '');
            } else {
                if (res.status === 401) router.push('/login');
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
                </div>
            </div>
        </div>
    );
}
