import React from 'react';

export const getPlayerInitials = (name?: string, surname?: string): string => {
    const first = name ? name.trim().charAt(0).toUpperCase() : '';
    const last = surname ? surname.trim().charAt(0).toUpperCase() : '';
    return `${first}${last}` || '??';
};

export const getAvatarGradientByElo = (elo?: number, seed?: string): string => {
    if (elo === undefined || elo === null) {
        // Fallback to hash if elo is not provided
        const AVATAR_COLORS = [
            'bg-[#0055D4] text-white',
            'bg-emerald-600 text-white',
            'bg-amber-500 text-white',
            'bg-rose-500 text-white',
            'bg-indigo-600 text-white',
        ];
        let hash = 0;
        const s = seed || 'default';
        for (let i = 0; i < s.length; i++) {
            hash = s.charCodeAt(i) + ((hash << 5) - hash);
        }
        return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
    }

    if (elo >= 1530) {
        // Top ranking - Vibrant Emerald Green
        return 'bg-emerald-500 text-white';
    } else if (elo >= 1510) {
        // Above average - Teal
        return 'bg-teal-500 text-white';
    } else if (elo >= 1490) {
        // Neutral around 1500 - Royal Blue
        return 'bg-[#0055D4] text-white';
    } else if (elo >= 1460) {
        // Below average - Warm Amber
        return 'bg-amber-500 text-white';
    } else {
        // Bottom ranking - Rose
        return 'bg-rose-500 text-white';
    }
};

export interface PlayerAvatarProps {
    name?: string;
    surname?: string;
    id?: string;
    elo?: number;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
    name = '',
    surname = '',
    id = '',
    elo,
    size = 'md',
    className = ''
}) => {
    const initials = getPlayerInitials(name, surname);
    const colorClass = getAvatarGradientByElo(elo, id || `${name}${surname}`);

    const sizeClasses = {
        sm: 'w-7 h-7 text-[11px]',
        md: 'w-9 h-9 text-xs',
        lg: 'w-11 h-11 text-sm',
        xl: 'w-14 h-14 text-base'
    }[size];

    return (
        <div 
            className={`${sizeClasses} rounded-full ${colorClass} flex items-center justify-center font-black shadow-sm border border-white/20 shrink-0 select-none ${className}`}
        >
            {initials}
        </div>
    );
};

export default PlayerAvatar;
