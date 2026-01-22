import React, { useEffect, useRef } from 'react';
import './ConfirmModal.css';

interface ConfirmModalProps {
    isOpen: boolean;
    title?: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    isDestructive?: boolean;
    isAlert?: boolean;
    checkboxLabel?: string;
    checkboxChecked?: boolean;
    onCheckboxChange?: (checked: boolean) => void;
    checkbox2Label?: string;
    checkbox2Checked?: boolean;
    onCheckbox2Change?: (checked: boolean) => void;
    requireCheckbox?: boolean; // Disables confirm until checkbox is checked
}

function ConfirmModal({
    isOpen,
    title = 'Confirm Action',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    isDestructive = false,
    isAlert = false,
    checkboxLabel,
    checkboxChecked = false,
    onCheckboxChange,
    checkbox2Label,
    checkbox2Checked = false,
    onCheckbox2Change,
    requireCheckbox = false,
}: ConfirmModalProps) {
    const confirmButtonRef = useRef<HTMLButtonElement>(null);
    const isConfirmDisabled = requireCheckbox && !checkboxChecked;

    // Focus confirm button when opened (only if not disabled)
    useEffect(() => {
        if (isOpen && confirmButtonRef.current && !isConfirmDisabled) {
            confirmButtonRef.current.focus();
        }
    }, [isOpen, isConfirmDisabled]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
            return () => window.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    return (
        <div className="confirm-modal-overlay" onClick={onCancel}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
                <div className="confirm-header">
                    <h3>{title}</h3>
                </div>
                <div className="confirm-content">
                    <div className="confirm-message">{message}</div>
                    {checkboxLabel && (
                        <div className="confirm-checkbox" onClick={() => onCheckboxChange?.(!checkboxChecked)}>
                            <div className={`confirm-checkbox-box ${checkboxChecked ? 'checked' : ''}`}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </div>
                            <span className="confirm-checkbox-label">{checkboxLabel}</span>
                        </div>
                    )}
                    {checkbox2Label && (
                        <div className="confirm-checkbox" onClick={() => onCheckbox2Change?.(!checkbox2Checked)}>
                            <div className={`confirm-checkbox-box ${checkbox2Checked ? 'checked' : ''}`}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </div>
                            <span className="confirm-checkbox-label">{checkbox2Label}</span>
                        </div>
                    )}
                </div>
                <div className="confirm-actions">
                    {!isAlert && (
                        <button className="btn btn-secondary" onClick={onCancel}>
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        ref={confirmButtonRef}
                        className={`btn ${isDestructive ? 'btn-primary' : 'btn-primary'}`}
                        style={isDestructive ? { background: 'var(--color-error)' } : undefined}
                        onClick={onConfirm}
                        disabled={isConfirmDisabled}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmModal;
