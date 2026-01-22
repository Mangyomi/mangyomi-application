import { useCallback } from 'react';
import './RangeSlider.css';

interface RangeSliderProps {
    min: number;
    max: number;
    value: number;
    step?: number;
    onChange: (value: number) => void;
    ticks?: { value: number; label: string }[];
    disabled?: boolean;
}

function RangeSlider({ min, max, value, step = 1, onChange, ticks, disabled = false }: RangeSliderProps) {
    // Calculate percentage for fill and thumb position
    const percentage = ((value - min) / (max - min)) * 100;

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(Number(e.target.value));
    }, [onChange]);

    return (
        <div className={`range-slider ${disabled ? 'disabled' : ''}`}>
            <div className="slider-track-container">
                <div className="slider-track">
                    <div className="slider-fill" style={{ width: `${percentage}%` }} />
                </div>
                {/* Custom thumb that moves with value */}
                <div className="slider-thumb" style={{ left: `${percentage}%` }} />
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={handleChange}
                    className="slider-input"
                    disabled={disabled}
                />
                {ticks && (
                    <div className="slider-ticks">
                        {ticks.map((tick, i) => {
                            const tickPercent = ((tick.value - min) / (max - min)) * 100;
                            const isAtThumb = value === tick.value;
                            const isEnd = i === 0 || i === ticks.length - 1;
                            return (
                                <div
                                    key={i}
                                    className={`slider-tick ${value >= tick.value ? 'active' : ''} ${isAtThumb ? 'hidden' : ''} ${isEnd ? 'end' : ''}`}
                                    style={{ left: `${tickPercent}%` }}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
            {ticks && (
                <div className="slider-labels">
                    {ticks.map((tick, i) => {
                        const tickPercent = ((tick.value - min) / (max - min)) * 100;
                        return (
                            <span
                                key={i}
                                className={value === tick.value ? 'active' : ''}
                                style={{ left: `${tickPercent}%` }}
                            >
                                {tick.label}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default RangeSlider;
