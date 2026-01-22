import { useState, useEffect } from 'react';
import { Icons } from '../../../components/Icons';
import './Stats.css';

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

function Stats() {
    const [stats, setStats] = useState<ReadingStatsSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadStats = async () => {
            try {
                const summary = await window.electronAPI.db.getReadingStatsSummary();
                setStats(summary);
            } catch (error) {
                console.error('[Stats] Failed to load stats:', error);
            } finally {
                setLoading(false);
            }
        };

        loadStats();
    }, []);

    if (loading) {
        return (
            <div className="stats-page">
                <div className="page-header">
                    <h1 className="page-title">Statistics</h1>
                </div>
                <div className="loading-state">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    const hasData = stats && (stats.totalPages > 0 || stats.weekChapters > 0);

    return (
        <div className="stats-page">
            <div className="page-header">
                <h1 className="page-title">Statistics</h1>
                <p className="page-subtitle">Your reading activity and achievements</p>
            </div>

            {!hasData ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <h2 className="empty-state-title">No reading stats yet</h2>
                    <p className="empty-state-description">
                        Start reading manga to see your statistics here.
                        Your reading time, chapters completed, and streaks will be tracked automatically.
                    </p>
                </div>
            ) : (
                <div className="stats-content">
                    {/* Quick Stats Cards */}
                    <section className="stats-section">
                        <h2 className="section-title">Overview</h2>
                        <div className="stats-cards">
                            <div className="stat-card">
                                <div className="stat-icon">⏱️</div>
                                <div className="stat-details">
                                    <span className="stat-value">{formatDuration(stats.todaySeconds)}</span>
                                    <span className="stat-label">Read Today</span>
                                </div>
                            </div>

                            <div className="stat-card">
                                <div className="stat-icon">📖</div>
                                <div className="stat-details">
                                    <span className="stat-value">{stats.weekChapters}</span>
                                    <span className="stat-label">Chapters This Week</span>
                                </div>
                            </div>

                            {stats.streak > 0 && (
                                <div className="stat-card streak">
                                    <div className="stat-icon">🔥</div>
                                    <div className="stat-details">
                                        <span className="stat-value">{stats.streak}</span>
                                        <span className="stat-label">Day Streak</span>
                                    </div>
                                </div>
                            )}

                            {stats.avgVelocity > 0 && (
                                <div className="stat-card">
                                    <div className="stat-icon">⚡</div>
                                    <div className="stat-details">
                                        <span className="stat-value">{stats.avgVelocity.toFixed(1)}</span>
                                        <span className="stat-label">Pages/Minute</span>
                                    </div>
                                </div>
                            )}

                            <div className="stat-card">
                                <div className="stat-icon">📚</div>
                                <div className="stat-details">
                                    <span className="stat-value">{formatNumber(stats.totalPages)}</span>
                                    <span className="stat-label">Total Pages Read</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Motivational Section */}
                    {stats.streak > 0 && (
                        <section className="stats-section motivation">
                            <div className="motivation-card">
                                <div className="motivation-icon">🎯</div>
                                <div className="motivation-text">
                                    <h3>Keep it up!</h3>
                                    <p>You're on a <strong>{stats.streak} day</strong> reading streak.
                                        Don't break the chain!</p>
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}

export default Stats;
