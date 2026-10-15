import React from 'react';
import { SFIcon } from './SFIcon';

export const ChartBarIcon = ({ className }: { className?: string }) => <SFIcon name="chart.bar.fill" className={className} />;
export const UsersIcon = ({ className }: { className?: string }) => <SFIcon name="person.2.fill" className={className} />;
export const TableIcon = ({ className }: { className?: string }) => <SFIcon name="tablecells" className={className} />;
export const ShuffleIcon = ({ className }: { className?: string }) => <SFIcon name="shuffle" className={className} />;
export const TrophyIcon = ({ className }: { className?: string }) => <SFIcon name="trophy.fill" className={className} />;
export const XIcon = ({ className }: { className?: string }) => <SFIcon name="xmark" className={className} />;
export const MenuIcon = ({ className }: { className?: string }) => <SFIcon name="line.3.horizontal" className={className} />;
export const TrashIcon = ({ className }: { className?: string }) => <SFIcon name="trash" className={className} />;
export const PrintIcon = ({ className }: { className?: string }) => <SFIcon name="printer" className={className} />;
export const SunIcon = ({ className }: { className?: string }) => <SFIcon name="sun.max.fill" className={className} />;
export const MoonIcon = ({ className }: { className?: string }) => <SFIcon name="moon.fill" className={className} />;
export const ArrowUpIcon = ({ className }: { className?: string }) => <SFIcon name="arrow.up" className={className} />;
export const ArrowDownIcon = ({ className }: { className?: string }) => <SFIcon name="arrow.down" className={className} />;
export const ArrowLeftIcon = ({ className }: { className?: string }) => <SFIcon name="arrow.left" className={className} />;
export const ArrowStableIcon = ({ className }: { className?: string }) => <SFIcon name="minus" className={className} />;
export const ChevronDownIcon = ({ className }: { className?: string }) => <SFIcon name="chevron.down" className={className} />;
export const PencilIcon = ({ className }: { className?: string }) => <SFIcon name="pencil" className={className} />;
export const StatsIcon = ({ className }: { className?: string }) => <SFIcon name="chart.bar.fill" className={className} />;
export const HomeIcon = ({ className }: { className?: string }) => <SFIcon name="house.fill" className={className} />;
export const CalendarIcon = ({ className }: { className?: string }) => <SFIcon name="calendar" className={className} />;
export const PlusIcon = ({ className }: { className?: string }) => <SFIcon name="plus" className={className} />;
export const ArrowUpRightIcon = ({ className, size = 11 }: { className?: string; size?: number }) => <SFIcon name="arrow.up.right" className={className} size={size} />;
export const MaterialIcon = ({ name, className, filled }: { name: string; className?: string; filled?: boolean }) => <SFIcon name={name} className={className} filled={filled} />;
export const BoxIcon = ({ className, size = 18 }: { className?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
