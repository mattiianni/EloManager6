import React from 'react';

/**
 * Props for the SFIcon component.
 */
export interface SFIconProps {
  /** SF Symbol name, e.g. "trophy.fill", "house", "chevron.right" */
  name: string;
  /** Icon size in pixels. Default: 22 */
  size?: number;
  /** Font weight matching SF Symbols weight scale */
  weight?: 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold';
  /** Whether to render the filled variant. Auto-detected from `.fill` suffix if present. Default: false */
  filled?: boolean;
  /** CSS color value or CSS variable, e.g. "var(--ios-systemBlue)" */
  color?: string;
  /** Additional CSS class names for the outer span */
  className?: string;
}

/**
 * Map of SF Symbol weight names → Material Symbols numeric `wght` values.
 */
const WEIGHT_MAP: Record<NonNullable<SFIconProps['weight']>, number> = {
  thin: 100,
  light: 200,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

/**
 * Comprehensive mapping from SF Symbol base names (without `.fill` suffix)
 * to their Google Material Symbols Outlined equivalents.
 *
 * When an SF Symbol name is not found here the raw name is passed through
 * to Material Symbols — it may still resolve if the names happen to match.
 */
const SF_TO_MATERIAL: Record<string, string> = {
  // Navigation & chrome
  'airplane': 'flight',
  'wifi': 'wifi',
  'bluetooth': 'bluetooth',
  'house': 'home',
  'line.3.horizontal': 'menu',
  'xmark': 'close',
  'magnifyingglass': 'search',

  // Tabs & features
  'trophy': 'emoji_events',
  'person.2': 'groups',
  'chart.line.uptrend.xyaxis': 'leaderboard',
  'chart.bar': 'query_stats',
  'gearshape': 'admin_panel_settings',
  'sportscourt': 'sports_score',
  'shuffle': 'shuffle',

  // Theme
  'sun.max': 'light_mode',
  'moon': 'dark_mode',

  // Auth / account
  'rectangle.portrait.and.arrow.right': 'logout',

  // Actions
  'plus': 'add',
  'minus': 'remove',
  'pencil': 'edit',
  'trash': 'delete',
  'printer': 'print',
  'checkmark': 'check',
  'checkmark.circle': 'check_circle',
  'exclamationmark.triangle': 'warning',
  'arrow.clockwise': 'refresh',
  'square.and.arrow.up': 'share',
  'link': 'link',
  'paperclip': 'attach_file',

  // Chevrons
  'chevron.right': 'chevron_right',
  'chevron.down': 'expand_more',
  'chevron.up': 'expand_less',
  'chevron.left': 'chevron_left',

  // Arrows
  'arrow.up': 'arrow_upward',
  'arrow.down': 'arrow_downward',
  'arrow.left': 'arrow_back',
  'arrow.right': 'arrow_forward',
  'arrow.up.right': 'north_east',
  'arrow.right.circle': 'arrow_circle_right',
  'arrow.left.and.right': 'sync_alt',

  // Info & status
  'info.circle': 'info',
  'star': 'star',
  'bolt': 'bolt',
  'flame': 'local_fire_department',
  'flag': 'flag',
  'bell': 'notifications',
  'target': 'my_location',

  // People
  'person': 'person',
  'person.fill.checkmark': 'how_to_reg',
  'person.fill.xmark': 'person_off',

  // Communication
  'phone': 'phone',
  'envelope': 'mail',
  'bubble.left': 'chat_bubble',
  'hand.thumbsup': 'thumb_up',

  // Documents & files
  'doc.text': 'description',
  'arrow.down.doc': 'download',
  'arrow.up.doc': 'upload',

  // Visibility
  'eye': 'visibility',
  'eye.slash': 'visibility_off',

  // Security
  'shield': 'shield',
  'lock': 'lock',
  'key': 'key',

  // Layout & controls
  'slider.horizontal.3': 'tune',
  'slider.vertical.3': 'equalizer',
  'list.bullet': 'list',
  'square.grid.2x2': 'grid_view',

  // Calendar & time
  'calendar': 'calendar_today',
  'clock': 'schedule',

  'crown': 'workspace_premium',
  'crown.fill': 'workspace_premium',
  'medal': 'military_tech',
  'bolt.fill': 'bolt',
  'shield.fill': 'shield',
  'arrow.up.right.circle': 'north_east',
  'arrow.down.right.circle': 'south_east',
  'waveform.path.ecg': 'monitor_heart',
  'rosette': 'award_star',

  // Media controls
  'play': 'play_arrow',
  'pause': 'pause',
  'stop': 'stop',

  // Charts
  'chart.pie': 'pie_chart',

  // Misc
  'paintbrush': 'brush',
  'wand.and.stars': 'auto_awesome',
  'figure.2': 'group',
  'sparkles': 'auto_awesome',
  
  // Custom & missing mappings
  'chevron.up.chevron.down': 'unfold_more',
  'arrow.down.to.line': 'vertical_align_bottom',
  '1.circle': 'looks_one',
  '2.circle': 'looks_two',
  '3.circle': 'looks_3',
  '4.circle': 'looks_4',
  '5.circle': 'looks_5',
};

/**
 * SFIcon – renders an SF Symbol name as a Google Material Symbols icon.
 *
 * Automatically detects the `.fill` suffix in SF Symbol names and sets the
 * FILL font-variation axis accordingly. Weight, size and color are all
 * configurable. If no mapping exists the raw name is passed through as a
 * fallback (Material Symbols may still resolve it).
 *
 * @example
 * ```tsx
 * <SFIcon name="trophy.fill" size={28} weight="semibold" color="var(--ios-systemBlue)" />
 * <SFIcon name="chevron.right" />
 * ```
 */
export const SFIcon: React.FC<SFIconProps> = ({
  name,
  size = 22,
  weight = 'regular',
  filled = false,
  color,
  className = '',
}) => {
  // ---- Resolve .fill suffix ------------------------------------------------
  let baseName = name;
  let isFilled = filled;

  if (baseName.endsWith('.fill')) {
    isFilled = true;
    baseName = baseName.slice(0, -5); // strip ".fill"
  }

  // Special-case: names that include ".fill" as part of the lookup key
  // (e.g. "person.fill.checkmark" should NOT strip the inner ".fill")
  // We check the original name first against the map for exact matches.
  const materialName =
    SF_TO_MATERIAL[name] ??       // exact match with original name (handles person.fill.checkmark etc.)
    SF_TO_MATERIAL[baseName] ??   // match after stripping .fill
    baseName.replace(/\./g, '_'); // fallback: pass through, replacing dots with underscores

  // ---- Font variation settings ---------------------------------------------
  const wght = WEIGHT_MAP[weight];
  const fill = isFilled ? 1 : 0;
  const fontVariationSettings = `'FILL' ${fill}, 'wght' ${wght}, 'GRAD' 0, 'opsz' ${size}`;

  return (
    <span
      className={`material-symbols-outlined select-none ${className}`.trim()}
      style={{
        fontVariationSettings,
        fontSize: size,
        lineHeight: 1,
        color: color ?? undefined,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-hidden="true"
    >
      {materialName}
    </span>
  );
};

export default SFIcon;
