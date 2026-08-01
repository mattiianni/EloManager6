
import React from 'react';
import HIGButton from './HIGButton';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'outline';
    size?: 'sm' | 'md' | 'lg';
    children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    children,
    className,
    ...props
}) => {
    let higVariant: 'filled' | 'gray' | 'success' | 'destructive' | 'plain' | 'tinted' = 'filled';
    if (variant === 'secondary') higVariant = 'gray';
    else if (variant === 'success') higVariant = 'success';
    else if (variant === 'danger') higVariant = 'destructive';
    else if (variant === 'ghost') higVariant = 'plain';
    else if (variant === 'outline') higVariant = 'tinted';
    
    let higSize: 'small' | 'regular' | 'large' = 'regular';
    if (size === 'sm') higSize = 'small';
    else if (size === 'lg') higSize = 'large';

    return (
        <HIGButton variant={higVariant} size={higSize} className={className} {...(props as any)}>
            {children}
        </HIGButton>
    );
};

export default Button;
