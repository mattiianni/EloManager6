import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface HIGSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  leadingAction?: { label: string; onPress: () => void };
  trailingAction?: { label: string; onPress: () => void; bold?: boolean; disabled?: boolean };
}

export const HIGSheet: React.FC<HIGSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  leadingAction,
  trailingAction,
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimating, setIsAnimating] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState(0);
  
  // Handle animation states
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
      document.body.style.overflow = 'hidden';
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setDragOffset(0);
        document.body.style.overflow = '';
      }, 400); // Wait for transition
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Touch handlers for drag-to-dismiss
  const touchStartY = useRef<number | null>(null);
  const currentY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartY.current = touch.clientY;
    currentY.current = touch.clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    
    // Only allow dragging if we're scrolled to top of sheet content
    if (sheetRef.current && sheetRef.current.scrollTop > 0) return;

    const touch = e.touches[0];
    currentY.current = touch.clientY;
    
    const delta = currentY.current - touchStartY.current;
    
    // Only allow dragging downwards
    if (delta > 0) {
      // Prevent default to stop scrolling
      if (e.cancelable) e.preventDefault();
      setDragOffset(delta);
    }
  };

  const handleTouchEnd = () => {
    if (touchStartY.current === null || currentY.current === null) return;
    
    const delta = currentY.current - touchStartY.current;
    
    if (delta > 150) {
      // Dragged down enough, close
      onClose();
    } else {
      // Snap back
      setDragOffset(0);
    }
    
    touchStartY.current = null;
    currentY.current = null;
  };

  if (!shouldRender) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          opacity: isAnimating && dragOffset < 150 ? 1 : 0,
          transition: 'opacity 400ms ease',
        }}
        onClick={onClose}
      />
      
      {/* Sheet Container */}
      <div 
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10000,
          pointerEvents: 'none', // Let clicks pass through except on sheet itself
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {/* Actual Sheet */}
        <div
          ref={sheetRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            pointerEvents: 'auto',
            background: 'var(--ios-secondarySystemGroupedBackground)',
            borderRadius: '12px 12px 0 0',
            width: '100%',
            maxWidth: '600px', // Don't let it be too wide on desktop
            maxHeight: 'calc(100dvh - 44px)',
            display: 'flex',
            flexDirection: 'column',
            transform: isAnimating ? `translateY(${dragOffset}px)` : 'translateY(100%)',
            transition: dragOffset > 0 ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
            willChange: 'transform',
          }}
        >
          {/* Grabber */}
          <div 
            style={{
              width: '36px',
              height: '5px',
              borderRadius: '2.5px',
              background: 'var(--ios-tertiaryLabel)',
              margin: '6px auto 0',
              flexShrink: 0,
            }}
          />
          
          {/* Navigation Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              height: '44px',
              borderBottom: '0.5px solid var(--ios-separator)',
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1 }}>
              {leadingAction && (
                <button
                  onClick={leadingAction.onPress}
                  style={{
                    font: '400 17px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                    color: 'var(--ios-systemBlue)',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {leadingAction.label}
                </button>
              )}
            </div>
            
            <div
              style={{
                font: '600 17px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                color: 'var(--ios-label)',
                textAlign: 'center',
              }}
            >
              {title}
            </div>
            
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              {trailingAction && (
                <button
                  onClick={trailingAction.onPress}
                  disabled={trailingAction.disabled}
                  style={{
                    font: `${trailingAction.bold ? '600' : '400'} 17px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`,
                    color: 'var(--ios-systemBlue)',
                    opacity: trailingAction.disabled ? 0.4 : 1,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: trailingAction.disabled ? 'default' : 'pointer',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {trailingAction.label}
                </button>
              )}
            </div>
          </div>
          
          {/* Content Area */}
          <div
            style={{
              padding: '0 0 calc(16px + env(safe-area-inset-bottom, 0px))',
              overflowY: 'auto',
              flex: 1,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};
