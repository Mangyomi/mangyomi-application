import React from 'react';

interface RestoreProgressModalProps {
    isOpen: boolean;
    status: string;
    current?: number;
    total?: number;
    onCancel: () => void;
    isCancelling: boolean;
}

export const RestoreProgressModal: React.FC<RestoreProgressModalProps> = ({
    isOpen,
    status,
    current = 0,
    total = 0,
    onCancel,
    isCancelling
}) => {
    if (!isOpen) return null;

    const progressPercentage = total > 0 ? (current / total) * 100 : 0;
    const isIndeterminate = total === 0;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
        }}>
            <div style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '24px',
                borderRadius: '12px',
                width: '400px',
                maxWidth: '90%',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                    Restore in Progress
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: 'var(--bg-tertiary)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        position: 'relative'
                    }}>
                        <div style={{
                            width: isIndeterminate ? '30%' : `${progressPercentage}%`,
                            height: '100%',
                            backgroundColor: 'var(--accent-primary)',
                            transition: isIndeterminate ? 'none' : 'width 0.3s ease',
                            animation: isIndeterminate ? 'indeterminate 1.5s infinite linear' : 'none'
                        }} />
                    </div>
                    <style>{`
                        @keyframes indeterminate {
                            0% { transform: translateX(-100%); }
                            100% { transform: translateX(400%); }
                        }
                    `}</style>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.9rem',
                        color: 'var(--text-secondary)'
                    }}>
                        <span>{status}</span>
                        {!isIndeterminate && <span>{Math.round(progressPercentage)}%</span>}
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button
                        onClick={onCancel}
                        disabled={isCancelling}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--text-secondary)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            cursor: isCancelling ? 'not-allowed' : 'pointer',
                            opacity: isCancelling ? 0.6 : 1,
                            transition: 'all 0.2s'
                        }}
                    >
                        {isCancelling ? 'Cancelling...' : 'Cancel'}
                    </button>
                </div>
            </div>
        </div>
    );
};
