'use client';
import { useState, useEffect } from 'react';
import { GlassButton, GlassInput } from '../components/ui';
import { DatePicker } from '../components/DatePicker';
import { format } from 'date-fns';

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

interface Props {
    isOpen: boolean;
    onClose: () => void;
    book: Bill | null;
    year: number;
    month: number;
    onSuccess: () => void;
}

export default function BillModal({ isOpen, onClose, book, year, month, onSuccess }: Props) {
    const [formData, setFormData] = useState({
        date: '',
        payee: '',
        payAmount: '',
        isPaid: false,
        paidDate: '',
        payer: '',
        receiveAmount: '',
        actualReceiveAmount: '',
        notes: '',
        isRecurring: false
    });

    useEffect(() => {
        if (book) {
            // Fix: Use format() instead of toISOString() to avoid UTC timezone off-by-one errors
            setFormData({
                date: book.date ? format(new Date(book.date), 'yyyy-MM-dd') : '',
                payee: book.payee || '',
                payAmount: book.payAmount?.toString() || '',
                isPaid: book.isPaid,
                paidDate: book.paidDate ? format(new Date(book.paidDate), 'yyyy-MM-dd') : '',
                payer: book.payer || '',
                receiveAmount: book.receiveAmount?.toString() || '',
                actualReceiveAmount: book.actualReceiveAmount?.toString() || '',
                notes: book.notes || '',
                isRecurring: book.isRecurring
            });
        } else {
            const defaultDate = new Date(year, month - 1, new Date().getDate());
            setFormData({
                date: format(defaultDate, 'yyyy-MM-dd'),
                payee: '',
                payAmount: '',
                isPaid: false,
                paidDate: '',
                payer: '',
                receiveAmount: '',
                actualReceiveAmount: '',
                notes: '',
                isRecurring: false
            });
        }
    }, [book, year, month, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const url = book ? `/api/bills/${book.id}` : '/api/bills';
            const method = book ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...formData,
                    payAmount: formData.payAmount ? parseFloat(formData.payAmount) : null,
                    receiveAmount: formData.receiveAmount ? parseFloat(formData.receiveAmount) : null,
                    actualReceiveAmount: formData.actualReceiveAmount ? parseFloat(formData.actualReceiveAmount) : null,
                    paidDate: formData.paidDate || null
                })
            });

            if (res.ok) {
                onSuccess();
                onClose();
            } else {
                alert('Saved failed');
            }
        } catch (error) {
            console.error(error);
            alert('Error saving bill');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white">✕</button>
                <h2 className="text-xl font-bold mb-6">{book ? 'Edit Bill' : 'New Bill'}</h2>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Row 1: Date & Recurring */}
                    <div className="md:col-span-2 flex gap-4">
                        <div className="flex-1">
                            <label className="block text-sm text-white/50 mb-1">Date</label>
                            <DatePicker
                                date={formData.date ? new Date(formData.date) : undefined}
                                setDate={(date) => setFormData({ ...formData, date: date ? format(date, 'yyyy-MM-dd') : '' })}
                            />
                        </div>
                        <div className="flex items-center pt-6">
                            <label className="flex items-center cursor-pointer gap-2">
                                <input type="checkbox" checked={formData.isRecurring} onChange={e => setFormData({ ...formData, isRecurring: e.target.checked })} className="form-checkbox bg-transparent border-white/30 rounded text-indigo-500 w-5 h-5" />
                                <span className="text-white/80 select-none">Next Month Recurring?</span>
                            </label>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="md:col-span-2 border-t border-white/10 my-2"></div>
                    <h3 className="md:col-span-2 text-indigo-300 font-medium">Payment Info (Out)</h3>

                    <div>
                        <label className="block text-sm text-white/50 mb-1">Payee (待支付方)</label>
                        <GlassInput value={formData.payee} onChange={e => setFormData({ ...formData, payee: e.target.value })} className="w-full" placeholder="e.g. Bank, Alipay" />
                    </div>
                    <div>
                        <label className="block text-sm text-white/50 mb-1">Pay Amount (¥)</label>
                        <GlassInput type="number" step="0.01" value={formData.payAmount} onChange={e => setFormData({ ...formData, payAmount: e.target.value })} className="w-full" />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="flex items-center cursor-pointer gap-2">
                            <input type="checkbox" checked={formData.isPaid} onChange={e => setFormData({ ...formData, isPaid: e.target.checked })} className="w-4 h-4" />
                            <span className="text-white/80">Paid?</span>
                        </label>
                    </div>
                    <div>
                        <label className="block text-sm text-white/50 mb-1">Actual Paid Date</label>
                        <DatePicker
                            date={formData.paidDate ? new Date(formData.paidDate) : undefined}
                            setDate={(date) => setFormData({ ...formData, paidDate: date ? format(date, 'yyyy-MM-dd') : '' })}
                            disabled={!formData.isPaid}
                        />
                    </div>

                    {/* Divider */}
                    <div className="md:col-span-2 border-t border-white/10 my-2"></div>
                    <h3 className="md:col-span-2 text-pink-300 font-medium">Receivable Info (In)</h3>

                    <div>
                        <label className="block text-sm text-white/50 mb-1">Payer (待收款方)</label>
                        <GlassInput value={formData.payer} onChange={e => setFormData({ ...formData, payer: e.target.value })} className="w-full" />
                    </div>
                    <div>
                        <label className="block text-sm text-white/50 mb-1">Receive Amount (¥)</label>
                        <GlassInput type="number" step="0.01" value={formData.receiveAmount} onChange={e => setFormData({ ...formData, receiveAmount: e.target.value })} className="w-full" />
                    </div>
                    <div>
                        <label className="block text-sm text-white/50 mb-1">Actual Receive Amount (¥)</label>
                        <GlassInput type="number" step="0.01" value={formData.actualReceiveAmount} onChange={e => setFormData({ ...formData, actualReceiveAmount: e.target.value })} className="w-full" />
                    </div>

                    {/* Divider */}
                    <div className="md:col-span-2 border-t border-white/10 my-2"></div>

                    <div className="md:col-span-2">
                        <label className="block text-sm text-white/50 mb-1">Notes</label>
                        <textarea
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            className="glass-input w-full h-20 resize-none"
                        />
                    </div>

                    <div className="md:col-span-2 flex justify-end gap-4 mt-4">
                        <button type="button" onClick={onClose} className="text-white/50 hover:text-white px-4 py-2">Cancel</button>
                        <GlassButton type="submit">Save Bill</GlassButton>
                    </div>
                </form>
            </div>
        </div>
    );
}
