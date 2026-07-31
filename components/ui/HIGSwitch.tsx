import React, { useCallback } from 'react';

/**
 * Props for the HIGSwitch component.
 */
export interface HIGSwitchProps {
  /** Whether the switch is toggled on */
  checked: boolean;
  /** Callback fired when the switch value changes */
  onChange: (checked: boolean) => void;
  /** Disables interaction and reduces opacity. Default: false */
  disabled?: boolean;
  /** Additional CSS class names for the outer wrapper */
  className?: string;
  /** Accessible name when no visible label is associated with the switch. */
  'aria-label'?: string;
  /** ID of the visible element that labels the switch. */
  'aria-labelledby'?: string;
}

/* ─── Constant dimensions (iOS UISwitch spec) ─────────────────────────── */
const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const TRACK_RADIUS = TRACK_HEIGHT / 2; // 15.5
const THUMB_SIZE = 27;
const THUMB_OFFSET_OFF = 2;
const THUMB_OFFSET_ON = TRACK_WIDTH - THUMB_SIZE - THUMB_OFFSET_OFF; // 22

const TRANSITION = '200ms cubic-bezier(0.4, 0, 0.2, 1)';

/**
 * HIGSwitch – an iOS UISwitch replica built with inline styles.
 *
 * Renders a 51 × 31 px track with a 27 × 27 px thumb. Supports
 * keyboard interaction (Space / Enter), ARIA `role="switch"`, and
 * a disabled state.
 *
 * @example
 * ```tsx
 * const [on, setOn] = useState(false);
 * <HIGSwitch checked={on} onChange={setOn} />
 * ```
 */
export const HIGSwitch: React.FC<HIGSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const toggle = useCallback(() => {
    if (!disabled) onChange(!checked);
  }, [checked, disabled, onChange]);

  /* ── Track styles ──────────────────────────────────────────────────── */
  const controlStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: TRACK_WIDTH,
    minWidth: 44,
    height: 44,
    minHeight: 44,
    padding: 0,
    border: 'none',
    background: 'transparent',
    borderRadius: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
  };

  const trackStyle: React.CSSProperties = {
    position: 'relative',
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_RADIUS,
    backgroundColor: checked ? 'var(--ios-systemGreen)' : 'var(--ios-systemFill)',
    border: checked ? 'none' : '2px solid var(--ios-separator)',
    boxSizing: 'border-box',
    transition: `background-color ${TRANSITION}, border-color ${TRANSITION}`,
  };

  /* ── Thumb styles ──────────────────────────────────────────────────── */
  const thumbStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    boxShadow:
      '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.06)',
    transform: `translate(${checked ? THUMB_OFFSET_ON : THUMB_OFFSET_OFF}px, -50%)`,
    transition: `transform ${TRANSITION}`,
    pointerEvents: 'none',
  };

  return (
    <button
      type="button"
      className={`hig-focus-ring ${className}`.trim()}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      disabled={disabled}
      onClick={toggle}
      style={controlStyle}
    >
      <span aria-hidden="true" style={trackStyle}>
        <span style={thumbStyle} />
      </span>
    </button>
  );
};

export default HIGSwitch;
