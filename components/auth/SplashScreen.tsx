
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.tsx';
import { APP_VERSION } from '../../constants.ts';
import Button from '../ui/Button.tsx';

const SplashScreen: React.FC = () => {
    const { login } = useAuth();
    const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        // Focus first input on mount
        inputRefs.current[0]?.focus();
    }, []);

    const handleChange = (index: number, value: string) => {
        // Only allow digits
        const digit = value.replace(/\D/g, '').slice(-1);
        const newDigits = [...digits];
        newDigits[index] = digit;
        setDigits(newDigits);
        setError(null);

        // Auto-advance to next input
        if (digit && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 digits are entered
        if (digit && index === 5) {
            const code = newDigits.join('');
            if (code.length === 6) {
                handleSubmit(code);
            }
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !digits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
            const newDigits = [...digits];
            newDigits[index - 1] = '';
            setDigits(newDigits);
        }
        if (e.key === 'Enter') {
            const code = digits.join('');
            if (code.length === 6) {
                handleSubmit(code);
            }
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            const newDigits = pasted.split('');
            setDigits(newDigits);
            inputRefs.current[5]?.focus();
            handleSubmit(pasted);
        }
    };

    const handleSubmit = async (code: string) => {
        setIsLoading(true);
        setError(null);

        const result = await login(code);

        if (!result.success) {
            setError(result.error || 'Codice non valido');
            setDigits(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        }
        setIsLoading(false);
    };

    const code = digits.join('');
    const isComplete = code.length === 6;

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-app p-4 text-slate-900 dark:text-white">
            <div className="relative z-10 w-full max-w-[390px]">
                <div className="fade-in rounded-[28px] bg-white dark:bg-[#1a2233] border border-slate-200/80 dark:border-white/10 p-7 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-none">
                    <div className="mb-7 flex flex-col items-center text-center">
                        <img 
                            src="/elomanager_w.png" 
                            alt="Padel Elo Manager" 
                            className="w-56 max-w-full h-auto object-contain block dark:hidden" 
                        />
                        <img 
                            src="/elomanager.png" 
                            alt="Padel Elo Manager" 
                            className="w-56 max-w-full h-auto object-contain hidden dark:block" 
                        />
                    </div>

                    <div className="mb-4 text-center text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Inserisci il codice di accesso
                    </div>

                    <div className="flex justify-center gap-2 sm:gap-2.5" onPaste={handlePaste}>
                        {digits.map((digit, index) => (
                            <input
                                key={index}
                                ref={el => { inputRefs.current[index] = el; }}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={digit}
                                onChange={e => handleChange(index, e.target.value)}
                                onKeyDown={e => handleKeyDown(index, e)}
                                disabled={isLoading}
                                style={{ WebkitTextSecurity: 'disc', textSecurity: 'disc' } as React.CSSProperties}
                                className={`h-12 w-10 sm:h-13 sm:w-11 rounded-2xl text-center text-xl sm:text-2xl font-black
                                    ${error
                                        ? 'border-2 border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                        : 'border border-slate-200 dark:border-white/10 focus:border-[#0055D4] focus:ring-2 focus:ring-[#0055D4]/20 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white'
                                    }
                                    outline-none transition-all duration-200
                                    placeholder:text-slate-400 ${isLoading ? 'opacity-50' : ''}
                                `}
                                aria-label={`Cifra ${index + 1}`}
                                placeholder=""
                            />
                        ))}
                    </div>

                    {error && (
                        <div className="mt-4 text-center">
                            <p className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 px-3 py-2 rounded-xl">
                                {error}
                            </p>
                        </div>
                    )}

                    <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        onClick={() => isComplete && handleSubmit(code)}
                        disabled={!isComplete || isLoading}
                        className="mt-7 w-full !h-11 !rounded-full !bg-[#0055D4] hover:!bg-[#0047B3] !font-bold !text-sm !text-white shadow-sm flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Verifica in corso...
                            </span>
                        ) : (
                            <span>Accedi</span>
                        )}
                    </Button>
                </div>

                <p className="mt-6 text-center text-xs font-semibold text-slate-400 dark:text-slate-500">
                    Padel ELO Manager v{APP_VERSION}
                </p>
            </div>
        </div>
    );
};

export default SplashScreen;
