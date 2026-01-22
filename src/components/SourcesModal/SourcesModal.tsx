import React, { useEffect, useRef } from 'react';
import { Extension } from '../../features/extensions/stores/extensionStore';
import { Icons } from '../Icons';
import './SourcesModal.css';

interface SourcesModalProps {
    isOpen: boolean;
    extensions: Extension[];
    selectedExtensionId: string | null;
    onSelect: (extension: Extension) => void;
    onClose: () => void;
    getIconUrl: (iconPath?: string) => string | null;
    onReorder?: (newOrder: string[]) => void;
}

function SourcesModal({
    isOpen,
    extensions,
    selectedExtensionId,
    onSelect,
    onClose,
    getIconUrl,
    onReorder,
}: SourcesModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);
    const [draggedId, setDraggedId] = React.useState<string | null>(null);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
            return () => window.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onClose]);

    const handleDragStart = (e: React.DragEvent, extId: string) => {
        setDraggedId(extId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', extId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId || !onReorder) {
            setDraggedId(null);
            return;
        }

        const currentOrder = extensions.map(ext => ext.id);
        const draggedIndex = currentOrder.indexOf(draggedId);
        const targetIndex = currentOrder.indexOf(targetId);

        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedId(null);
            return;
        }

        currentOrder.splice(draggedIndex, 1);
        currentOrder.splice(targetIndex, 0, draggedId);

        onReorder(currentOrder);
        setDraggedId(null);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
    };

    if (!isOpen) return null;

    return (
        <div className="sources-modal-overlay" onClick={onClose}>
            <div
                className="sources-modal"
                ref={modalRef}
                onClick={e => e.stopPropagation()}
            >
                <div className="sources-modal-header">
                    <h3>Select Source</h3>
                    <button className="sources-modal-close" onClick={onClose}>
                        <Icons.X width={20} height={20} />
                    </button>
                </div>
                <div className="sources-modal-grid">
                    {extensions.map(ext => (
                        <button
                            key={ext.id}
                            className={`source-item ${selectedExtensionId === ext.id ? 'active' : ''} ${draggedId === ext.id ? 'dragging' : ''}`}
                            onClick={() => {
                                onSelect(ext);
                                onClose();
                            }}
                            draggable={!!onReorder}
                            onDragStart={(e) => handleDragStart(e, ext.id)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, ext.id)}
                            onDragEnd={handleDragEnd}
                        >
                            <div className="source-item-icon">
                                {ext.icon ? (
                                    <img src={getIconUrl(ext.icon) || ''} alt="" className="source-icon-img" />
                                ) : (
                                    <Icons.Book width={32} height={32} opacity={0.7} />
                                )}
                            </div>
                            <span className="source-item-name">{ext.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default SourcesModal;
