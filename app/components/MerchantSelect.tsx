'use client';

import { useState, useEffect, useRef } from 'react';
import { GlassInput } from './ui';
import { Upload, Image as ImageIcon } from 'lucide-react';

interface Merchant {
    name: string;
    icon: string | null;
}

interface MerchantSelectProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export function MerchantSelect({ value, onChange, placeholder, className }: MerchantSelectProps) {
    const [merchants, setMerchants] = useState<Merchant[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filteredMerchants, setFilteredMerchants] = useState<Merchant[]>([]);
    const [isLoadingIcon, setIsLoadingIcon] = useState(false);

    // Fetch merchants on load
    useEffect(() => {
        fetchMerchants();
    }, []);

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
            console.error('Failed to fetch merchants', error);
        }
    };

    // Filter merchants based on input
    useEffect(() => {
        const query = value.toLowerCase();
        const filtered = merchants.filter(m => m.name.toLowerCase().includes(query));
        setFilteredMerchants(filtered);
    }, [value, merchants]);

    const handleSelect = (merchant: Merchant) => {
        onChange(merchant.name);
        setShowSuggestions(false);
    };

    const handleUploadIcon = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;

        setIsLoadingIcon(true);
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);

        try {
            // 1. Upload Image
            const token = localStorage.getItem('token');
            const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (!uploadRes.ok) throw new Error('Upload failed');
            const { url } = await uploadRes.json();

            // 2. Save Merchant with new Icon
            const saveRes = await fetch('/api/merchants', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name: value, icon: url })
            });

            if (!saveRes.ok) throw new Error('Save failed');

            // 3. Refresh list
            await fetchMerchants();

        } catch (error) {
            console.error(error);
            alert('Failed to upload icon');
        } finally {
            setIsLoadingIcon(false);
        }
    };

    const currentMerchant = merchants.find(m => m.name === value);
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className={`relative ${className}`}>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <GlassInput
                        value={value}
                        onChange={(e) => {
                            onChange(e.target.value);
                            setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder={placeholder}
                        className="w-full pl-10"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                        {currentMerchant?.icon ? (
                            <img src={currentMerchant.icon} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                            <ImageIcon className="w-4 h-4 text-white/30" />
                        )}
                    </div>
                </div>

                {value && (
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
                        title="Upload Icon"
                    >
                        {isLoadingIcon ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Upload className="w-4 h-4 text-white/50" />
                        )}
                    </button>
                )}
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleUploadIcon}
                />
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && filteredMerchants.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {filteredMerchants.map(merchant => (
                        <button
                            key={merchant.name}
                            type="button"
                            onClick={() => handleSelect(merchant)}
                            className="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center gap-3 transition-colors"
                        >
                            <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {merchant.icon ? (
                                    <img src={merchant.icon} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-xs text-white/50">{merchant.name[0].toUpperCase()}</span>
                                )}
                            </div>
                            <span className="text-white/80 truncate">{merchant.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
