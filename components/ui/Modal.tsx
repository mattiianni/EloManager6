
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MaterialIcon } from './Icons.tsx';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.addEventListener('mousedown', handleClickOutside);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('mousedown', handleClickOutside);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    if (!isOpen) {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/40 dark:bg-black/60 p-3 sm:p-4 backdrop-blur-md transition-all duration-300" role="dialog" aria-modal="true">
            <div ref={modalRef} className="fade-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200/70 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 shadow-2xl shadow-sky-950/10 dark:shadow-black/60 backdrop-blur-2xl transition-all">
                <header className="flex items-center justify-between border-b border-slate-200/60 dark:border-white/10 px-5 py-4 bg-slate-50/50 dark:bg-slate-900/50">
                    <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">{title}</h2>
                    <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full border border-slate-200/60 dark:border-white/10 bg-slate-100/70 dark:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/20 transition-all" aria-label="Close modal">
                        <MaterialIcon name="close" className="text-[18px]" />
                    </button>
                </header>
                <main className="overflow-y-auto p-4 sm:p-6 text-slate-800 dark:text-slate-100">
                    {children}
                </main>
            </div>
        </div>,
        document.body
    );
};

export default Modal;
