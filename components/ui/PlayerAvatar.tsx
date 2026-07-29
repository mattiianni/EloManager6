import React from 'react';

export const getPlayerInitials = (name?: string, surname?: string): string => {
    const first = name ? name.trim().charAt(0).toUpperCase() : '';
    const last = surname ? surname.trim().charAt(0).toUpperCase() : '';
    return `${first}${last}` || '??';
};

export const getAvatarGradientByElo = (elo?: number, seed?: string): string => {
    if (elo === undefined || elo === null) {
        // Fallback to hash if elo is not provided
        const AVATAR_GRADIENTS = [
            'from-sky-400 to-blue-600',
            'from-emerald-400 to-teal-600',
            'from-amber-400 to-orange-500',
            'from-rose-400 to-pink-600',
            'from-indigo-500 to-purple-600',
        ];
        let hash = 0;
        const s = seed || 'default';
        for (let i = 0; i < s.length; i++) {
            hash = s.charCodeAt(i) + ((hash << 5) - hash);
        }
        return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
    }

    if (elo >= 1530) {
        // Top ranking - Vibrant Emerald / Teal Green
        return 'from-emerald-500 to-teal-600 text-white';
    } else if (elo >= 1510) {
        // Above average - Teal / Cyan Green
        return 'from-teal-400 to-cyan-500 text-white';
    } else if (elo >= 1490) {
        // Neutral around 1500 - Sky / Royal Blue
        return 'from-sky-400 to-blue-600 text-white';
    } else if (elo >= 1460) {
        // Below average - Warm Amber / Light Orange
        return 'from-amber-400 to-orange-500 text-white';
    } else {
        // Bottom ranking - Deep Orange / Rose
        return 'from-orange-500 to-rose-600 text-white';
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
    const gradient = getAvatarGradientByElo(elo, id || `${name}${surname}`);

    const sizeClasses = {
        sm: 'w-7 h-7 text-[11px]',
        md: 'w-9 h-9 text-xs',
        lg: 'w-11 h-11 text-sm',
        xl: 'w-14 h-14 text-base'
    }[size];

    return (
        <div 
            className={`${sizeClasses} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-black text-white shadow-md border border-white/20 shrink-0 select-none ${className}`}
        >
            {initials}
        </div>
    );
};

export default PlayerAvatar;
