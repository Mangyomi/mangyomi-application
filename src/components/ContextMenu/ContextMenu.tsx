import { useEffect, useRef } from 'react';
import './ContextMenu.css';

export interface ContextMenuItem {
    label: string;
    icon?: string;
    onClick: () => void;
    danger?: boolean;
    divider?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    // Adjust position to keep menu in viewport
    useEffect(() => {
        if (menuRef.current) {
            const menu = menuRef.current;
            const rect = menu.getBoundingClientRect();

            let adjustedX = x;
            let adjustedY = y;

            if (x + rect.width > window.innerWidth) {
                adjustedX = window.innerWidth - rect.width - 8;
            }
            if (y + rect.height > window.innerHeight) {
                adjustedY = window.innerHeight - rect.height - 8;
            }

            menu.style.left = `${adjustedX}px`;
            menu.style.top = `${adjustedY}px`;
        }
    }, [x, y]);

    const handleItemClick = (item: ContextMenuItem) => {
        item.onClick();
        onClose();
    };

    return (
        <div
            className="context-menu"
            ref={menuRef}
            style={{ left: x, top: y }}
        >
            {items.map((item, index) => (
                item.divider ? (
                    <div key={index} className="context-menu-divider" />
                ) : (
                    <button
                        key={index}
                        className={`context-menu-item ${item.danger ? 'danger' : ''}`}
                        onClick={() => handleItemClick(item)}
                    >
                        {item.icon && <span className="context-menu-icon">{item.icon}</span>}
                        <span className="context-menu-label">{item.label}</span>
                    </button>
                )
            ))}
        </div>
    );
}

export default ContextMenu;
