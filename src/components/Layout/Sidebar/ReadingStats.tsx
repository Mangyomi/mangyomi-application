import { useState, useEffect } from 'react';
import './ReadingStats.css';

interface ReadingStatsSummary {
    todaySeconds: number;
    weekChapters: number;
    streak: number;
    avgVelocity: number;
    totalPages: number;
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
}

function ReadingStats() {
    const [stats, setStats] = useState<ReadingStatsSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadStats = async () => {
            try {
                const summary = await window.electronAPI.db.getReadingStatsSummary();
                setStats(summary);
            } catch (error) {
                console.error('[ReadingStats] Failed to load stats:', error);
            } finally {
                setLoading(false);
            }
        };

        loadStats();

        // Refresh stats every minute
        const interval = setInterval(loadStats, 60000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return null;
    }

    // Show placeholder if no reading activity yet
    const hasData = stats && (stats.totalPages > 0 || stats.weekChapters > 0);

    return (
        <div className="reading-stats">
            <div className="reading-stats-header">
                <span className="reading-stats-icon">📊</span>
                <span className="reading-stats-title">Your Reading</span>
            </div>

            {!hasData ? (
                <div className="reading-stats-empty">
                    Start reading to see your stats!
                </div>
            ) : (
                <div className="reading-stats-grid">
                    {stats.todaySeconds > 0 && (
                        <div className="stat-item">
                            <span className="stat-value">{formatDuration(stats.todaySeconds)}</span>
                            <span className="stat-label">Today</span>
                        </div>
                    )}

                    {stats.weekChapters > 0 && (
                        <div className="stat-item">
                            <span className="stat-value">{stats.weekChapters}</span>
                            <span className="stat-label">Chapters</span>
                        </div>
                    )}

                    {stats.streak > 1 && (
                        <div className="stat-item streak">
                            <span className="stat-value">🔥 {stats.streak}</span>
                            <span className="stat-label">Day Streak</span>
                        </div>
                    )}

                    {stats.avgVelocity > 0 && (
                        <div className="stat-item">
                            <span className="stat-value">{stats.avgVelocity.toFixed(1)}</span>
                            <span className="stat-label">Pages/min</span>
                        </div>
                    )}

                    {stats.totalPages > 100 && (
                        <div className="stat-item">
                            <span className="stat-value">{formatNumber(stats.totalPages)}</span>
                            <span className="stat-label">Total Pages</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default ReadingStats;
