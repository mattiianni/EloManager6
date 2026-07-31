import React, { useEffect, useState } from 'react';
import { HIGAlert } from './HIGAlert.tsx';
import { HIG_DIALOG_EVENT, HIGDialogRequest } from '../../utils/higDialogService.ts';

export const HIGDialogHost: React.FC = () => {
    const [queue, setQueue] = useState<HIGDialogRequest[]>([]);
    const current = queue[0] || null;

    useEffect(() => {
        const receive = (event: Event) => {
            const request = (event as CustomEvent<HIGDialogRequest>).detail;
            if (request) setQueue(previous => [...previous, request]);
        };
        window.addEventListener(HIG_DIALOG_EVENT, receive);
        return () => window.removeEventListener(HIG_DIALOG_EVENT, receive);
    }, []);

    const finish = (confirmed: boolean) => {
        current?.resolve?.(confirmed);
        setQueue(previous => previous.slice(1));
    };

    return (
        <HIGAlert
            isOpen={Boolean(current)}
            title={current?.title || 'Avviso'}
            message={current?.message}
            actions={current?.kind === 'confirm'
                ? [
                    {
                        label: current.confirmLabel || 'Conferma',
                        style: current.destructive ? 'destructive' : 'default',
                        onPress: () => finish(true),
                    },
                    { label: current.cancelLabel || 'Annulla', style: 'cancel', onPress: () => finish(false) },
                ]
                : [{ label: current?.confirmLabel || 'OK', onPress: () => finish(true) }]}
        />
    );
};
