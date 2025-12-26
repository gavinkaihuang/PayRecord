import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

// Components
export function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`glass-panel ${className}`}>{children}</div>;
}

export function GlassButton({ children, className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
    const baseClass = variant === 'primary' ? 'glass-button' : variant === 'secondary' ? 'glass-button-secondary' : 'bg-red-500/20 hover:bg-red-500/40 text-white font-medium py-2 px-6 rounded-lg transition-all border border-red-500/20';
    return (
        <button className={`${baseClass} ${className}`} {...props}>
            {children}
        </button>
    );
}

export function GlassInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
    return <input className={`glass-input ${className}`} {...props} />;
}
