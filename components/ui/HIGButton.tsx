import React, { useState, useCallback } from 'react';

/**
 * Props for the HIGButton component.
 */
export interface HIGButtonProps {
  /** Button content (text, icons, or mixed) */
  children: React.ReactNode;
  /** Click handler */
  onClick?: () => void;
  /**
   * Visual variant.
   * - `filled`      – solid blue background, white text
   * - `tinted`      – translucent blue background, blue text
   * - `gray`        – system fill background, label text
   * - `plain`       – transparent, blue text, minimal padding
   * - `destructive` – solid red background, white text
   */
  variant?: 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive';
  /** Size preset. Default: `regular` */
  size?: 'large' | 'regular' | 'small';
  /** Disables interaction and reduces opacity. Default: false */
  disabled?: boolean;
  /** Stretch to fill available width. Default: false */
  fullWidth?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** HTML button type attribute. Default: `button` */
  type?: 'button' | 'submit';
}

/* ─── Size presets ────────────────────────────────────────────────────── */
interface SizePreset {
  height: number;
  paddingH: number;
  fontSize: number;
  fontWeight: number;
}

const SIZE_MAP: Record<NonNullable<HIGButtonProps['size']>, SizePreset> = {
  large: { height: 50, paddingH: 20, fontSize: 17, fontWeight: 600 },
  regular: { height: 44, paddingH: 16, fontSize: 17, fontWeight: 400 },
  small: { height: 44, paddingH: 12, fontSize: 15, fontWeight: 400 },
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
        backgroundColor: 'var(--ios-systemBlue)',
        color: '#ffffff',
        borderRadius: 12,
      };
    case 'tinted':
      return {
        backgroundColor: 'var(--hig-btn-tint-bg, rgba(0, 122, 255, 0.15))',
        color: 'var(--ios-systemBlue)',
        borderRadius: 12,
      };
    case 'gray':
      return {
        backgroundColor: 'var(--ios-systemFill)',
        color: 'var(--ios-label)',
        borderRadius: 12,
      };
    case 'plain':
      return {
        backgroundColor: 'transparent',
        color: 'var(--ios-systemBlue)',
        borderRadius: 0,
      };
    case 'destructive':
      return {
        backgroundColor: 'var(--ios-systemRed)',
        color: '#ffffff',
        borderRadius: 12,
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
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    WebkitTapHighlightColor: 'transparent',

    // Layout
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: variant === 'plain' ? 44 : sizePreset.height,
    padding:
      variant === 'plain'
        ? '4px 8px'
        : `8px ${sizePreset.paddingH}px`,
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
  };

  return (
    <>
      {/* Inject tint-background CSS custom property scoped to dark / light */}
      {variant === 'tinted' && (
        <style>{`
          .${TINT_SCOPE_CLASS} {
            --hig-btn-tint-bg: rgba(0, 122, 255, 0.15);
          }
          @media (prefers-color-scheme: dark) {
            .${TINT_SCOPE_CLASS} {
              --hig-btn-tint-bg: rgba(10, 132, 255, 0.15);
            }
          }
          [data-theme="dark"] .${TINT_SCOPE_CLASS} {
            --hig-btn-tint-bg: rgba(10, 132, 255, 0.15);
          }
          [data-theme="light"] .${TINT_SCOPE_CLASS} {
            --hig-btn-tint-bg: rgba(0, 122, 255, 0.15);
          }
        `}</style>
      )}

      <button
        type={type}
        className={`${variant === 'tinted' ? TINT_SCOPE_CLASS : ''} ${className}`.trim()}
        style={buttonStyle}
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
      >
        {children}
      </button>
    </>
  );
};

export default HIGButton;
