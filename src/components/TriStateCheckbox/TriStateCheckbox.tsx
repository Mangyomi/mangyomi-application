import React from 'react';
import './TriStateCheckbox.css';

export type TriState = 'neutral' | 'include' | 'exclude';

interface TriStateCheckboxProps {
    label: string;
    state: TriState;
    onChange: (newState: TriState) => void;
}

const TriStateCheckbox: React.FC<TriStateCheckboxProps> = ({ label, state, onChange }) => {
    const handleClick = () => {
        const nextState: TriState =
            state === 'neutral' ? 'include' :
                state === 'include' ? 'exclude' : 'neutral';
        onChange(nextState);
    };

    return (
        <div className={`tri-state-checkbox ${state}`} onClick={handleClick}>
            {state === 'include' && <span className="tri-state-icon">✓</span>}
            {state === 'exclude' && <span className="tri-state-icon">✕</span>}
            <span className="tri-state-label">{label}</span>
        </div>
    );
};

export default TriStateCheckbox;
