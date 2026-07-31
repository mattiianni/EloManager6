import React from 'react';
import { SFIcon } from './SFIcon';
import { HIGSwitch } from './HIGSwitch';

interface HIGListProps {
  children: React.ReactNode;
  className?: string;
}

export const HIGList: React.FC<HIGListProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`hig-list ${className}`}
      style={{ background: 'var(--ios-systemGroupedBackground)', minHeight: '100%' }}
    >
      {children}
    </div>
  );
};

interface HIGListSectionProps {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const HIGListSection: React.FC<HIGListSectionProps> = ({ header, footer, children }) => {
  const childrenArray = React.Children.toArray(children);
  const content = childrenArray.map((child, index) => {
    return (
      <React.Fragment key={index}>
        {child}
        {index < childrenArray.length - 1 && (
          <div className="mx-4" style={{ height: '0.5px', background: 'var(--ios-separator)', opacity: 0.5 }} />
        )}
      </React.Fragment>
    );
  });

  return (
    <div className="hig-list-section" style={{ marginBottom: '24px' }}>
      {header && (
        <div
          style={{
            font: "400 13px/18px 'Manrope', sans-serif",
            color: 'var(--ios-secondaryLabel)',
            textTransform: 'uppercase',
            padding: '6px 20px 4px',
            letterSpacing: '0.02em',
          }}
        >
          {header}
        </div>
      )}
      
      <div
        style={{
          background: 'var(--ios-secondarySystemGroupedBackground)',
          borderRadius: '10px',
          overflow: 'hidden',
          margin: '0 16px',
        }}
      >
        {content}
      </div>

      {footer && (
        <div
          style={{
            font: "400 13px/18px 'Manrope', sans-serif",
            color: 'var(--ios-secondaryLabel)',
            padding: '4px 20px 6px',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
};

interface HIGListRowProps {
  label: string;
  detail?: string | React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  accessory?: 'chevron' | 'switch' | 'checkmark' | React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  switchChecked?: boolean;
  onSwitchChange?: (checked: boolean) => void;
  className?: string;
}

export const HIGListRow: React.FC<HIGListRowProps> = ({
  label,
  detail,
  subtitle,
  icon,
  accessory,
  onPress,
  destructive = false,
  switchChecked,
  onSwitchChange,
  className = '',
}) => {
  // Removed isPressed and pointer handlers to rely on CSS active state

  const accessoryElement = (() => {
    if (accessory === 'chevron') {
      return <SFIcon name="chevron.right" color="var(--ios-tertiaryLabel)" size={20} />;
    }
    if (accessory === 'checkmark') {
      return <SFIcon name="checkmark" color="var(--ios-systemBlue)" size={20} weight="semibold" />;
    }
    if (accessory === 'switch') {
      return (
        <HIGSwitch 
          checked={switchChecked || false} 
          onChange={(c) => onSwitchChange && onSwitchChange(c)} 
          aria-label={label}
        />
      );
    }
    return accessory;
  })();

  return (
    <div
      className={`hig-list-row ${className} ${onPress ? 'active:bg-[var(--ios-quaternarySystemFill)] transition-colors duration-200' : ''}`}
      onClick={onPress}
      style={{
        minHeight: '44px',
        display: 'flex',
        alignItems: 'center',
        padding: '11px 16px',
        cursor: onPress ? 'pointer' : 'default',
        background: 'transparent',
      }}
    >
      {icon && (
        <div
          style={{
            marginRight: '12px',
            width: '29px',
            height: '29px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div
          style={{
            font: "400 17px/22px 'Manrope', sans-serif",
            color: destructive ? 'var(--ios-systemRed)' : 'var(--ios-label)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
        {subtitle && (
          <div
            style={{
              font: "400 15px/20px 'Manrope', sans-serif",
              color: 'var(--ios-secondaryLabel)',
              marginTop: '2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {(detail || accessoryElement) && (
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: '12px', flexShrink: 0 }}>
          {detail && (
            <div
              style={{
                font: "400 17px/22px 'Manrope', sans-serif",
                color: 'var(--ios-secondaryLabel)',
                marginRight: accessoryElement ? '8px' : '0',
              }}
            >
              {detail}
            </div>
          )}
          {accessoryElement}
        </div>
      )}
    </div>
  );
};
