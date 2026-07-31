export interface HIGDialogOptions {
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

export interface HIGDialogRequest extends HIGDialogOptions {
    id: string;
    kind: 'alert' | 'confirm';
    message: string;
    resolve?: (confirmed: boolean) => void;
}

export const HIG_DIALOG_EVENT = 'elo-manager:hig-dialog';

const createRequestId = () => globalThis.crypto?.randomUUID?.()
    || `dialog-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const emitDialog = (request: HIGDialogRequest) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<HIGDialogRequest>(HIG_DIALOG_EVENT, { detail: request }));
};

const defaultTitle = (message: string) =>
    /errore|impossibile|non disponibile|non supportato/i.test(message) ? 'Errore' : 'Avviso';

export const showHIGAlert = (message: unknown, options: HIGDialogOptions = {}) => {
    const normalizedMessage = String(message ?? '');
    emitDialog({
        id: createRequestId(),
        kind: 'alert',
        message: normalizedMessage,
        title: options.title || defaultTitle(normalizedMessage),
        confirmLabel: options.confirmLabel || 'OK',
    });
};

export const requestHIGConfirmation = (
    message: unknown,
    options: HIGDialogOptions = {},
): Promise<boolean> => new Promise(resolve => {
    const normalizedMessage = String(message ?? '');
    emitDialog({
        id: createRequestId(),
        kind: 'confirm',
        message: normalizedMessage,
        title: options.title || 'Conferma',
        confirmLabel: options.confirmLabel || 'Conferma',
        cancelLabel: options.cancelLabel || 'Annulla',
        destructive: options.destructive,
        resolve,
    });
});
