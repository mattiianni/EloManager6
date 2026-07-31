import React from 'react';

/**
 * Props for the HIGSegmentedControl component.
 */
export interface HIGSegmentedControlProps {
  /** Array of segment labels */
  segments: string[];
  /** Zero-based index of the currently selected segment */
  selectedIndex: number;
  /** Callback fired when a segment is tapped / clicked */
  onChange: (index: number) => void;
  /** Additional CSS class names for the outer container */
  className?: string;
}

/* ─── Constants ───────────────────────────────────────────────────────── */
const CONTROL_HEIGHT = 32;
const CONTROL_PADDING = 2;
const CONTROL_RADIUS = 9;
const SEGMENT_RADIUS = 7;
const TRANSITION = 'transform 220ms ease-out';

/**
 * Unique class name used to scope the injected dark-mode override.
 * We use a deterministic string so multiple instances share the same
 * `<style>` block (idempotent injection is handled by React's lifecycle).
 */
const HIGHLIGHT_CLASS = 'hig-seg-highlight';

/**
 * HIGSegmentedControl – an iOS UISegmentedControl replica.
 *
 * The selected-segment highlight is implemented as an absolutely-positioned
 * `<div>` that slides behind the segment labels via `translateX`. Its
 * background colour automatically switches between light and dark mode
 * using a `@media (prefers-color-scheme)` query *and* a `[data-theme]`
 * attribute selector so it works with both OS-level and app-level theming.
 *
 * @example
 * ```tsx
 * const [idx, setIdx] = useState(0);
 * <HIGSegmentedControl
 *   segments={['Day', 'Week', 'Month']}
 *   selectedIndex={idx}
 *   onChange={setIdx}
 * />
 * ```
 */
export const HIGSegmentedControl: React.FC<HIGSegmentedControlProps> = ({
  segments,
  selectedIndex,
  onChange,
  className = '',
}) => {
  const segmentCount = segments.length;
  // Width of each segment as a percentage
  const segmentWidthPct = 100 / segmentCount;

  /* ── Container ─────────────────────────────────────────────────────── */
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    position: 'relative',
    alignItems: 'center',
    height: CONTROL_HEIGHT,
    padding: CONTROL_PADDING,
    borderRadius: CONTROL_RADIUS,
    backgroundColor: 'var(--ios-tertiarySystemFill)',
    boxSizing: 'border-box',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  };

  /* ── Sliding highlight ─────────────────────────────────────────────── */
  const highlightStyle: React.CSSProperties = {
    position: 'absolute',
    top: CONTROL_PADDING,
    bottom: CONTROL_PADDING,
    left: CONTROL_PADDING,
    // Width = (container inner width / segmentCount). We approximate with
    // `calc()` so it stays fluid.
    width: `calc((100% - ${CONTROL_PADDING * 2}px) / ${segmentCount})`,
    borderRadius: SEGMENT_RADIUS,
    boxShadow:
      '0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04)',
    transform: `translateX(${selectedIndex * 100}%)`,
    transition: TRANSITION,
    pointerEvents: 'none',
    zIndex: 0,
  };

  /* ── Individual segment button ─────────────────────────────────────── */
  const segmentBaseStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 1,
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    padding: 0,
    fontFamily: "'Manrope', sans-serif",
    fontSize: 13,
    fontWeight: 500,
    lineHeight: '18px',
    transition: 'color 220ms ease-out',
    WebkitTapHighlightColor: 'transparent',
    outline: 'none',
  };

  return (
    <>
      {/* Inject scoped dark / light mode styles for the highlight background */}
      <style>{`
        .${HIGHLIGHT_CLASS} {
          background-color: var(--ios-segmentedSelected);
        }
      `}</style>

      <div className={className} style={containerStyle} role="tablist">
        {/* Sliding highlight */}
        <div className={HIGHLIGHT_CLASS} style={highlightStyle} />

        {/* Segment labels */}
        {segments.map((label, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={label}
              role="tab"
              aria-selected={isSelected}
              onClick={() => onChange(index)}
              style={{
                ...segmentBaseStyle,
                color: isSelected
                  ? 'var(--ios-label)'
                  : 'var(--ios-secondaryLabel)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
};

export default HIGSegmentedControl;
