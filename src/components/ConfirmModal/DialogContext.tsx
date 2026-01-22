import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ConfirmModal from './ConfirmModal';

interface DialogOptions {
    title?: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
    checkboxLabel?: string;
    checkboxDefaultChecked?: boolean;
    checkbox2Label?: string;
    checkbox2DefaultChecked?: boolean;
    requireCheckbox?: boolean; // Disables confirm until checkbox is checked
}

// Update the return type to allow an object with checkbox status
interface DialogContextType {
    confirm: (options: DialogOptions) => Promise<any>;
    alert: (message: ReactNode, title?: string) => Promise<void>;
}

const DialogContext = createContext<DialogContextType | null>(null);

export function useDialog() {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error('useDialog must be used within a DialogProvider');
    }
    return context;
}

interface DialogState {
    isOpen: boolean;
    mode: 'confirm' | 'alert';
    options: DialogOptions;
    resolve: ((value: any) => void) | null;
    checkboxChecked: boolean;
    checkbox2Checked: boolean;
}

export function DialogProvider({ children }: { children: ReactNode }) {
    const [dialogState, setDialogState] = useState<DialogState>({
        isOpen: false,
        mode: 'confirm',
        options: { message: '' },
        resolve: null,
        checkboxChecked: false,
        checkbox2Checked: false,
    });

    const confirm = useCallback((options: DialogOptions): Promise<any> => {
        return new Promise((resolve) => {
            setDialogState({
                isOpen: true,
                mode: 'confirm',
                options,
                resolve,
                checkboxChecked: options.checkboxDefaultChecked || false,
                checkbox2Checked: options.checkbox2DefaultChecked || false,
            });
        });
    }, []);

    const alert = useCallback((message: ReactNode, title?: string): Promise<void> => {
        return new Promise((resolve) => {
            setDialogState({
                isOpen: true,
                mode: 'alert',
                options: { message, title: title || 'Notice' },
                resolve: () => resolve(),
                checkboxChecked: false,
                checkbox2Checked: false,
            });
        });
    }, []);

    const handleConfirm = () => {
        if (dialogState.options.checkboxLabel || dialogState.options.checkbox2Label) {
            dialogState.resolve?.({
                confirmed: true,
                isChecked: dialogState.checkboxChecked,
                isChecked2: dialogState.checkbox2Checked
            });
        } else {
            dialogState.resolve?.(true);
        }
        setDialogState((prev) => ({ ...prev, isOpen: false, resolve: null }));
    };

    const handleCancel = () => {
        dialogState.resolve?.(false);
        setDialogState((prev) => ({ ...prev, isOpen: false, resolve: null }));
    };

    return (
        <DialogContext.Provider value={{ confirm, alert }}>
            {children}
            <ConfirmModal
                isOpen={dialogState.isOpen}
                title={dialogState.options.title}
                message={dialogState.options.message}
                confirmLabel={dialogState.mode === 'alert' ? 'OK' : dialogState.options.confirmLabel}
                cancelLabel={dialogState.options.cancelLabel}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                isDestructive={dialogState.options.isDestructive}
                isAlert={dialogState.mode === 'alert'}
                checkboxLabel={dialogState.options.checkboxLabel}
                checkboxChecked={dialogState.checkboxChecked}
                onCheckboxChange={(checked) => setDialogState(prev => ({ ...prev, checkboxChecked: checked }))}
                checkbox2Label={dialogState.options.checkbox2Label}
                checkbox2Checked={dialogState.checkbox2Checked}
                onCheckbox2Change={(checked) => setDialogState(prev => ({ ...prev, checkbox2Checked: checked }))}
                requireCheckbox={dialogState.options.requireCheckbox}
            />
        </DialogContext.Provider>
    );
}
