
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.tsx';
import { APP_VERSION } from '../../constants.ts';
import { MaterialIcon } from '../ui/Icons.tsx';

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
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--ios-systemGroupedBackground)] p-4 text-[var(--ios-label)]">
            <div className="relative z-10 w-full max-w-[400px]">
                <div className="fade-in rounded-3xl bg-[var(--ios-secondarySystemGroupedBackground)] p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
                    <div className="mb-8 flex flex-col items-center text-center">
                        <img 
                            src="/elomanager_w.png" 
                            alt="Padel Elo Manager" 
                            className="w-96 max-w-full h-auto object-contain block dark:hidden" 
                        />
                        <img 
                            src="/elomanager.png" 
                            alt="Padel Elo Manager" 
                            className="w-96 max-w-full h-auto object-contain hidden dark:block" 
                        />
                    </div>

                    <div className="mb-4 text-center text-sm font-medium text-[var(--ios-secondaryLabel)]">
                        Inserisci il codice di accesso
                    </div>

                    <div className="flex justify-center gap-2" onPaste={handlePaste}>
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
                                className={`h-14 w-12 rounded-[14px] text-center text-2xl font-bold tracking-widest
                                    ${error
                                        ? 'border-2 border-[var(--ios-systemRed)] bg-red-50 dark:bg-red-900/20 text-[var(--ios-systemRed)]'
                                        : 'border border-[var(--ios-separator)] focus:border-2 focus:border-[var(--ios-systemBlue)] bg-[var(--ios-systemBackground)] text-[var(--ios-label)]'
                                    }
                                    outline-none transition-all duration-200
                                    placeholder:text-[var(--ios-tertiaryLabel)] ${isLoading ? 'opacity-50' : ''}
                                `}
                                aria-label={`Cifra ${index + 1}`}
                                placeholder=""
                            />
                        ))}
                    </div>

                    {error && (
                        <div className="mt-4 text-center">
                            <p className="text-sm font-medium text-[var(--ios-systemRed)]">
                                {error}
                            </p>
                        </div>
                    )}

                    <button
                        onClick={() => isComplete && handleSubmit(code)}
                        disabled={!isComplete || isLoading}
                        className={`mt-8 flex h-[50px] w-full items-center justify-center gap-2 rounded-xl px-4 font-semibold text-[17px] transition-all duration-200
                            ${isComplete && !isLoading
                                ? 'bg-[var(--ios-systemBlue)] text-white hover:opacity-90 active:scale-[0.98]'
                                : 'cursor-not-allowed bg-[var(--ios-systemFill)] text-[var(--ios-tertiaryLabel)]'
                            }
                        `}
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Verifica in corso...
                            </span>
                        ) : (
                            <>
                                <span>Accedi</span>
                            </>
                        )}
                    </button>
                </div>

                <p className="mt-8 text-center text-xs font-medium text-[var(--ios-tertiaryLabel)]">
                    Padel ELO Manager v{APP_VERSION}
                </p>
            </div>
        </div>
    );
};

export default SplashScreen;
