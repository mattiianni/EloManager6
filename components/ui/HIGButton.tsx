import React, { useState, useCallback } from 'react';

/**
 * Props for the HIGButton component.
 */
export interface HIGButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'size'> {
  /** Button content (text, icons, or mixed) */
  children: React.ReactNode;
  /**
   * Visual variant.
   * - `filled`      – solid blue background, white text
   * - `tinted`      – translucent blue background, blue text
   * - `gray`        – system fill background, label text
   * - `plain`       – transparent, blue text, minimal padding
   * - `destructive` – solid red background, white text
   */
  variant?: 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive' | 'success';
  /** Size preset. Default: `regular` */
  size?: 'large' | 'regular' | 'small';
  /** Disables interaction and reduces opacity. Default: false */
  disabled?: boolean;
  /** Stretch to fill available width. Default: false */
  fullWidth?: boolean;
}

/* ─── Size presets ────────────────────────────────────────────────────── */
interface SizePreset {
  height: number;
  paddingH: number;
  fontSize: number;
  fontWeight: number;
}

const SIZE_MAP: Record<NonNullable<HIGButtonProps['size']>, SizePreset> = {
  large: { height: 44, paddingH: 18, fontSize: 15, fontWeight: 600 },
  regular: { height: 34, paddingH: 14, fontSize: 13, fontWeight: 600 },
  small: { height: 28, paddingH: 10, fontSize: 12, fontWeight: 500 },
};

/* ─── Variant style builders ──────────────────────────────────────────── */

/**
 * Builds the variant-specific inline styles.
 *
 * For the `tinted` variant we inject CSS custom properties at the
 * component level and reference them here so that the semi-transparent
 * blue adapts to light / dark mode. The matching `<style>` block is
 * rendered inside the component.
 */
function variantStyles(variant: NonNullable<HIGButtonProps['variant']>): React.CSSProperties {
  switch (variant) {
    case 'filled':
      return {
        backgroundColor: '#0055D4',
        color: '#ffffff',
        borderRadius: 9999,
      };
    case 'tinted':
      return {
        backgroundColor: 'var(--hig-btn-tint-bg, rgba(0, 85, 212, 0.12))',
        color: '#0055D4',
        borderRadius: 9999,
      };
    case 'gray':
      return {
        backgroundColor: 'var(--ios-systemFill)',
        color: 'var(--ios-label)',
        borderRadius: 9999,
      };
    case 'plain':
      return {
        backgroundColor: 'transparent',
        color: '#0055D4',
        borderRadius: 9999,
      };
    case 'destructive':
      return {
        backgroundColor: '#EF4444',
        color: '#ffffff',
        borderRadius: 9999,
      };
    case 'success':
      return {
        backgroundColor: '#10B981',
        color: '#ffffff',
        borderRadius: 9999,
      };
  }
}

/**
 * Scoped class name used for injecting the light/dark tint background
 * CSS custom property.
 */
const TINT_SCOPE_CLASS = 'hig-btn-tint-scope';

/**
 * HIGButton – Apple Human Interface Guidelines button.
 *
 * Provides five visual variants and three size presets. Press feedback
 * is handled via `onPointerDown` / `onPointerUp` to produce a subtle
 * scale + opacity change, matching native iOS tap behaviour.
 *
 * @example
 * ```tsx
 * <HIGButton variant="filled" size="large" onClick={handleSave}>
 *   Save
 * </HIGButton>
 *
 * <HIGButton variant="tinted">
 *   <SFIcon name="plus" size={16} /> Add Player
 * </HIGButton>
 *
 * <HIGButton variant="destructive" size="small">
 *   Delete
 * </HIGButton>
 * ```
 */
export const HIGButton: React.FC<HIGButtonProps> = ({
  children,
  onClick,
  variant = 'filled',
  size = 'regular',
  disabled = false,
  fullWidth = false,
  className = '',
  type = 'button',
  style,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  ...buttonProps
}) => {
  const [pressed, setPressed] = useState(false);

  const handlePointerDown = useCallback(() => {
    if (!disabled) setPressed(true);
  }, [disabled]);

  const handlePointerUp = useCallback(() => setPressed(false), []);
  const handlePointerLeave = useCallback(() => setPressed(false), []);

  const sizePreset = SIZE_MAP[size];
  const vStyles = variantStyles(variant as NonNullable<HIGButtonProps['variant']>);

  const buttonStyle: React.CSSProperties = {
    // Reset
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    WebkitTapHighlightColor: 'transparent',

    // Layout
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: variant === 'plain' ? 36 : sizePreset.height,
    padding:
      variant === 'plain'
        ? '4px 8px'
        : `6px ${sizePreset.paddingH}px`,
    width: fullWidth ? '100%' : undefined,
    boxSizing: 'border-box',

    // Typography
    fontFamily: "'Manrope', sans-serif",
    fontSize: sizePreset.fontSize,
    fontWeight: sizePreset.fontWeight,
    lineHeight: 1.2,
    textDecoration: 'none',
    whiteSpace: 'normal',
    wordBreak: 'break-word',

    // Variant visuals
    ...vStyles,

    // State feedback
    opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
    transform: pressed ? 'scale(0.97)' : 'scale(1)',
    transition:
      'transform 120ms ease-out, opacity 120ms ease-out',
    ...style,
  };

  return (
    <>
      {/* Responsive button sizing for desktop */}
      <style>{`
        @media (min-width: 768px) {
          .hig-btn-responsive-large   { min-height: 48px !important; font-size: 16px !important; padding-left: 22px !important; padding-right: 22px !important; }
          .hig-btn-responsive-regular { min-height: 38px !important; font-size: 14px !important; padding-left: 18px !important; padding-right: 18px !important; }
          .hig-btn-responsive-small   { min-height: 32px !important; font-size: 13px !important; padding-left: 14px !important; padding-right: 14px !important; }
        }
      `}</style>
      {/* Inject tint-background CSS custom property scoped to dark / light */}
      {variant === 'tinted' && (
        <style>{`
          .${TINT_SCOPE_CLASS} {
            --hig-btn-tint-bg: rgba(0, 85, 212, 0.12);
          }
          @media (prefers-color-scheme: dark) {
            .${TINT_SCOPE_CLASS} {
              --hig-btn-tint-bg: rgba(0, 85, 212, 0.22);
            }
          }
          [data-theme="dark"] .${TINT_SCOPE_CLASS} {
            --hig-btn-tint-bg: rgba(0, 85, 212, 0.22);
          }
          [data-theme="light"] .${TINT_SCOPE_CLASS} {
            --hig-btn-tint-bg: rgba(0, 85, 212, 0.12);
          }
        `}</style>
      )}

      <button
        {...buttonProps}
        type={type}
        className={`hig-focus-ring hig-btn-responsive-${size} ${variant === 'tinted' ? TINT_SCOPE_CLASS : ''} ${className}`.trim()}
        style={buttonStyle}
        disabled={disabled}
        onClick={onClick}
        onPointerDown={(event) => {
          handlePointerDown();
          onPointerDown?.(event);
        }}
        onPointerUp={(event) => {
          handlePointerUp();
          onPointerUp?.(event);
        }}
        onPointerLeave={(event) => {
          handlePointerLeave();
          onPointerLeave?.(event);
        }}
        onPointerCancel={(event) => {
          handlePointerLeave();
          onPointerCancel?.(event);
        }}
      >
        {children}
      </button>
    </>
  );
};

export default HIGButton;
