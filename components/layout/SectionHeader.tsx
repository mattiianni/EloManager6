import React from 'react';

interface SectionHeaderProps {
  title: React.ReactNode;
  action?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, action }) => {
  return (
    <div style={{ padding: '6px 20px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      {typeof title === 'string' ? (
        <span
          style={{
            font: "400 13px/18px 'Manrope', sans-serif",
            color: 'var(--ios-secondaryLabel)',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
        >
          {title}
        </span>
      ) : (
        title
      )}
      {action}
    </div>
  );
};

export default SectionHeader;
