import iconStable from '/icon.png?url';
import iconNightly from '/icon-nightly.png?url';

interface LogoProps {
    className?: string;
    size?: number;
}

const isNightlyBuild = (): boolean => {
    try {
        return APP_VERSION?.includes('nightly') || false;
    } catch {
        return false;
    }
};

export const Logo = ({ className = '', size = 24 }: LogoProps) => {
    const isNightly = isNightlyBuild();

    return (
        <img
            src={isNightly ? iconNightly : iconStable}
            className={className}
            width={size}
            height={size}
            alt="Mangyomi Logo"
        />
    );
};
