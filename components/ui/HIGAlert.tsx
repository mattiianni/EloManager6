import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface HIGAlertAction {
  label: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress: () => void;
}

export interface HIGAlertProps {
  isOpen: boolean;
  title: string;
  message?: string;
  actions: HIGAlertAction[];
  isLoading?: boolean;
  loadingText?: string;
  progressPercent?: number;
}

export const HIGAlert: React.FC<HIGAlertProps> = ({ 
  isOpen, 
  title, 
  message, 
  actions, 
  isLoading = false,
  loadingText = "Eliminazione in corso...",
  progressPercent = 0
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimating, setIsAnimating] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      const firstAction = dialogRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
      (firstAction || dialogRef.current)?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const appShell = document.querySelector<HTMLElement>('.app-shell');
    const previousOverflow = document.body.style.overflow;
    const previousAriaHidden = appShell?.getAttribute('aria-hidden');
    document.body.style.overflow = 'hidden';
    appShell?.setAttribute('inert', '');
    appShell?.setAttribute('aria-hidden', 'true');
    return () => {
      document.body.style.overflow = previousOverflow;
      appShell?.removeAttribute('inert');
      if (previousAriaHidden === null || previousAriaHidden === undefined) appShell?.removeAttribute('aria-hidden');
      else appShell?.setAttribute('aria-hidden', previousAriaHidden);
    };
  }, [isOpen]);

  const handleBackdropClick = () => {
    if (isLoading) return; // Prevent closing while executing task
    const cancelAction = actions.find(a => a.style === 'cancel');
    if (cancelAction) {
      cancelAction.onPress();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return;
      if (e.key === 'Escape' && isOpen) {
        const cancelAction = actions.find(a => a.style === 'cancel');
        if (cancelAction) {
          cancelAction.onPress();
        } else if (actions.length > 0) {
          actions[0].onPress();
        }
        return;
      }
      if (e.key === 'Tab' && isOpen && dialogRef.current) {
        const focusable = (Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )) as HTMLElement[]).filter(element => element.offsetParent !== null);
        if (focusable.length === 0) {
          e.preventDefault();
          dialogRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, actions, isLoading]);

  if (!shouldRender) return null;

  // Ensure cancel is always at the bottom
  const sortedActions = [...actions].sort((a, b) => {
    if (a.style === 'cancel') return 1;
    if (b.style === 'cancel') return -1;
    return 0;
  });

  return createPortal(
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 11000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isAnimating ? 1 : 0,
        transition: 'opacity 200ms ease-out',
      }}
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(340px, calc(100vw - 32px))',
          borderRadius: '16px',
          overflow: 'hidden',
          background: 'var(--ios-thickMaterial)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          transform: isAnimating ? 'scale(1)' : 'scale(1.05)',
          transition: 'transform 200ms ease-out',
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ padding: message ? '20px 20px 8px' : '20px 20px' }}>
          <div
            id={titleId}
            style={{
              font: "600 18px/24px 'Manrope', sans-serif",
              color: 'var(--ios-label)',
              textAlign: 'center',
            }}
          >
            {title}
          </div>
        </div>

        {message && (
          <div
            id={messageId}
            style={{
              font: "400 14px/20px 'Manrope', sans-serif",
              color: 'var(--ios-secondaryLabel)',
              textAlign: 'center',
              padding: '0 20px 18px',
              whiteSpace: 'pre-line',
            }}
          >
            {message}
          </div>
        )}

        {/* LOADING & PROGRESS CONTROL MODULE */}
        {isLoading ? (
          <div style={{ padding: '16px 20px 24px', borderTop: '0.5px solid var(--ios-separator)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div className="flex items-center justify-center gap-3 text-sky-600 dark:text-sky-400 font-semibold text-sm">
              <svg className="animate-spin h-5 w-5 text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{loadingText}</span>
            </div>
            
            {/* Progress Bar Container */}
            <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.1)', borderRadius: '999px', overflow: 'hidden', position: 'relative' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${Math.max(5, Math.min(100, progressPercent))}%`, 
                  background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
                  borderRadius: '999px',
                  transition: 'width 250ms ease-out'
                }} 
              />
            </div>
            <span className="text-xs text-gray-500 font-mono">{Math.round(progressPercent)}% completato</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {sortedActions.map((action, index) => {
              const isCancel = action.style === 'cancel';
              const isDestructive = action.style === 'destructive';
              
              return (
                <button
                  key={index}
                  onClick={action.onPress}
                  className="hig-alert-button"
                  style={{
                    width: '100%',
                    minHeight: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    font: `${isCancel ? '600' : '400'} 16px/22px 'Manrope', sans-serif`,
                    color: isDestructive ? 'var(--ios-systemRed)' : 'var(--ios-systemBlue)',
                    background: 'transparent',
                    border: 'none',
                    borderTop: '0.5px solid var(--ios-separator)',
                    cursor: 'pointer',
                    padding: '12px 16px',
                    textAlign: 'center',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                  }}
                  onPointerDown={(e) => {
                    e.currentTarget.style.background = 'var(--ios-quaternarySystemFill)';
                  }}
                  onPointerUp={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  onPointerLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
