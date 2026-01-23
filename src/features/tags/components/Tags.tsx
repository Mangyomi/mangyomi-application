import { useState, useEffect, useMemo } from 'react';
import { useAppStore, Manga } from '../../../stores/appStore';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { useExtensionStore } from '../../extensions/stores/extensionStore';
import { useTagStore, Tag } from '../stores/tagStore';
import MangaCard from '../../../components/MangaCard/MangaCard';
import ConfirmModal from '../../../components/ConfirmModal/ConfirmModal';
import { Icons } from '../../../components/Icons';
import './Tags.css';

const TAG_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
];

function Tags() {
    const { extensions } = useExtensionStore();
    const {
        tags, loadTags, createTag, updateTag, deleteTag, removeTagFromManga,
        getMangaByTag, selectedTag, setSelectedTag
    } = useTagStore();
    const { hideNsfwInTags, hideNsfwCompletely } = useSettingsStore();

    // State for NSFW-filtered tag counts
    const [filteredTagCounts, setFilteredTagCounts] = useState<Map<number, number>>(new Map());

    // Compute NSFW extension set
    const nsfwExtensions = useMemo(() => new Set(
        extensions.filter(ext => ext.nsfw).map(ext => ext.id)
    ), [extensions]);

    // Load filtered counts for all tags when NSFW settings are active
    useEffect(() => {
        const loadFilteredCounts = async () => {
            if (!hideNsfwCompletely && !hideNsfwInTags) {
                // No filtering needed - use original counts
                setFilteredTagCounts(new Map(tags.map(tag => [tag.id, tag.count || 0])));
                return;
            }

            // Fetch manga for each tag and count non-NSFW ones
            const counts = new Map<number, number>();
            for (const tag of tags) {
                try {
                    const mangaList = await getMangaByTag(tag.id);
                    const filteredCount = mangaList.filter(
                        (manga: Manga) => !nsfwExtensions.has(manga.source_id)
                    ).length;
                    counts.set(tag.id, filteredCount);
                } catch {
                    counts.set(tag.id, tag.count || 0);
                }
            }
            setFilteredTagCounts(counts);
        };

        if (tags.length > 0) {
            loadFilteredCounts();
        }
    }, [tags, hideNsfwCompletely, hideNsfwInTags, nsfwExtensions, getMangaByTag]);

    useEffect(() => {
        loadTags();
    }, []);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
    const [newTagNsfw, setNewTagNsfw] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [showColorWheel, setShowColorWheel] = useState(false);
    const [customHex, setCustomHex] = useState('#8b5cf6');

    // Edit state
    const [editingTag, setEditingTag] = useState<Tag | null>(null);

    // Confirmation Modal State
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);

    // Drill-down state (we are using store state for selectedTag, but local for list)
    // Note: selectedTag is now in store, but we sync it here? 
    // Actually the original used local selectedTag. I moved it to store.
    // So I should use store's selectedTag.

    const [tagManga, setTagManga] = useState<Manga[]>([]);
    const [loadingManga, setLoadingManga] = useState(false);

    // Reload manga when selectedTag is set but tagManga is empty (e.g., navigating back)
    useEffect(() => {
        const reloadMangaForTag = async () => {
            if (selectedTag && tagManga.length === 0 && !loadingManga) {
                setLoadingManga(true);
                try {
                    const mangaList = await getMangaByTag(selectedTag.id);
                    setTagManga(mangaList);
                } catch (error) {
                    console.error('Failed to reload manga for tag', error);
                } finally {
                    setLoadingManga(false);
                }
            }
        };
        reloadMangaForTag();
    }, [selectedTag, getMangaByTag]);


    // Open create modal
    const openCreateModal = () => {
        setEditingTag(null);
        setNewTagName('');
        setNewTagColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]);
        setNewTagNsfw(false);
        setIsCreating(true);
    };

    // Open edit modal
    const openEditModal = (tag: Tag, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingTag(tag);
        setNewTagName(tag.name);
        setNewTagColor(tag.color);
        setNewTagNsfw(tag.isNsfw || false);
        setIsCreating(true);
    };

    const handleRemoveFromTag = async (e: React.MouseEvent, manga: any) => {
        e.preventDefault();
        e.stopPropagation();

        if (!selectedTag) return;

        // Find full manga object from list
        const fullManga = tagManga.find(m => m.source_manga_id === manga.id && m.source_id === manga.extensionId);

        if (fullManga) {
            try {
                await removeTagFromManga(fullManga.id, selectedTag.id);

                // Remove from local list immediately
                setTagManga(prev => prev.filter(m => m.id !== fullManga.id));

                // Update count in filtered counts map
                setFilteredTagCounts(prev => {
                    const newMap = new Map(prev);
                    const currentCount = newMap.get(selectedTag.id) || 0;
                    newMap.set(selectedTag.id, Math.max(0, currentCount - 1));
                    return newMap;
                });

                // Reload tags to sync global counts
                loadTags();
            } catch (error) {
                console.error('Failed to remove tag from manga:', error);
            }
        }
    };

    const handleSaveTag = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTagName.trim()) return;

        if (editingTag) {
            await updateTag(editingTag.id, newTagName.trim(), newTagColor, newTagNsfw);
        } else {
            await createTag(newTagName.trim(), newTagColor, newTagNsfw);
        }

        // Reset
        setNewTagName('');
        setNewTagColor(TAG_COLORS[0]);
        setNewTagNsfw(false);
        setIsCreating(false);
        setEditingTag(null);
    };

    const handleDeleteClick = (tag: Tag, e: React.MouseEvent) => {
        e.stopPropagation();
        setTagToDelete(tag);
        setShowConfirmDelete(true);
    };

    const confirmDelete = async () => {
        if (tagToDelete) {
            await deleteTag(tagToDelete.id);
            if (selectedTag?.id === tagToDelete.id) {
                setSelectedTag(null);
            }
            setShowConfirmDelete(false);
            setTagToDelete(null);
        }
    };

    const handleTagClick = async (tag: Tag) => {
        setSelectedTag(tag);
        setLoadingManga(true);
        try {
            const mangaList = await getMangaByTag(tag.id);
            setTagManga(mangaList);
        } catch (error) {
            console.error('Failed to load manga for tag', error);
        } finally {
            setLoadingManga(false);
        }
    };

    const handleBack = () => {
        setSelectedTag(null);
        setTagManga([]);
    };

    // Filter NSFW manga from tag results
    const filteredTagManga = useMemo(() => {
        // If viewing an NSFW tag and NSFW content should be hidden, return empty
        if (selectedTag?.isNsfw && (hideNsfwCompletely || hideNsfwInTags)) {
            return [];
        }
        if (!hideNsfwCompletely && !hideNsfwInTags) return tagManga;
        const nsfwExtensions = new Set(
            extensions.filter(ext => ext.nsfw).map(ext => ext.id)
        );
        return tagManga.filter(manga => !nsfwExtensions.has(manga.source_id));
    }, [tagManga, hideNsfwCompletely, hideNsfwInTags, extensions, selectedTag]);

    if (selectedTag) {
        return (
            <div className="tags-page">
                <div className="page-header">
                    <div className="header-left">
                        <button className="btn btn-ghost" onClick={handleBack} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Icons.ArrowLeft width={18} height={18} /> Back
                        </button>
                        <div>
                            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span
                                    className="tag-dot-large"
                                    style={{ background: selectedTag.color, width: 16, height: 16, borderRadius: '50%', display: 'inline-block' }}
                                />
                                {selectedTag.name}
                                {selectedTag.isNsfw && <span className="nsfw-badge">NSFW</span>}
                            </h1>
                            <p className="page-subtitle">{filteredTagManga.length} manga</p>
                        </div>
                    </div>
                </div>

                {loadingManga ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                    </div>
                ) : filteredTagManga.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon"><Icons.Library width={64} height={64} /></div>
                        <h2 className="empty-state-title">No manga with this tag</h2>
                        <p className="empty-state-description">
                            Add this tag to manga from their details page.
                        </p>
                    </div>
                ) : (
                    <div className="manga-grid">
                        {filteredTagManga.map(manga => (
                            <MangaCard
                                key={manga.id}
                                id={manga.source_manga_id}
                                title={manga.title}
                                coverUrl={manga.cover_url}
                                extensionId={manga.source_id}
                                action={{
                                    icon: <Icons.Trash width={16} height={16} />,
                                    onClick: handleRemoveFromTag,
                                    variant: 'danger',
                                    title: 'Remove from Tag'
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="tags-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Tags</h1>
                    <p className="page-subtitle">Organize your manga collection</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={openCreateModal}
                >
                    + New Tag
                </button>
            </div>

            {/* Create/Edit Tag Modal */}
            {isCreating && (
                <div className="create-tag-modal">
                    <form className="create-tag-form" onSubmit={handleSaveTag}>
                        <h3 className="create-tag-title">
                            {editingTag ? 'Edit Tag' : 'Create New Tag'}
                        </h3>

                        <div className="form-group">
                            <label className="form-label">Name</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Enter tag name..."
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Color</label>
                            <div className="color-picker">
                                {TAG_COLORS.map(color => (
                                    <button
                                        key={color}
                                        type="button"
                                        className={`color-option ${newTagColor === color ? 'active' : ''}`}
                                        style={{ backgroundColor: color }}
                                        onClick={() => {
                                            setNewTagColor(color);
                                            setShowColorWheel(false);
                                        }}
                                    />
                                ))}
                                {/* Custom Color Button */}
                                <button
                                    type="button"
                                    className={`color-option custom-color-btn ${!TAG_COLORS.includes(newTagColor) ? 'active' : ''}`}
                                    style={{
                                        background: !TAG_COLORS.includes(newTagColor)
                                            ? newTagColor
                                            : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
                                    }}
                                    onClick={() => setShowColorWheel(!showColorWheel)}
                                    title="Custom color"
                                />
                            </div>

                            {/* Color Wheel Popup - Modal Style */}
                            {showColorWheel && (
                                <div className="color-wheel-overlay" onClick={() => setShowColorWheel(false)}>
                                    <div className="color-wheel-modal" onClick={e => e.stopPropagation()}>
                                        <div className="color-wheel-header">
                                            <span>Custom Color</span>
                                            <button
                                                type="button"
                                                className="close-wheel-btn"
                                                onClick={() => setShowColorWheel(false)}
                                            >
                                                <Icons.X width={14} height={14} />
                                            </button>
                                        </div>

                                        {/* Color Preview */}
                                        <div className="color-wheel-preview" style={{ backgroundColor: customHex }} />

                                        {/* Hue Slider - Full spectrum */}
                                        <div className="color-slider-section">
                                            <label>Hue</label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="360"
                                                className="hue-slider"
                                                style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
                                                value={(() => {
                                                    const hex = customHex.replace('#', '');
                                                    if (hex.length !== 6) return 0;
                                                    const r = parseInt(hex.substr(0, 2), 16) / 255;
                                                    const g = parseInt(hex.substr(2, 2), 16) / 255;
                                                    const b = parseInt(hex.substr(4, 2), 16) / 255;
                                                    const max = Math.max(r, g, b), min = Math.min(r, g, b);
                                                    let h = 0;
                                                    if (max !== min) {
                                                        const d = max - min;
                                                        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                                                        else if (max === g) h = ((b - r) / d + 2) / 6;
                                                        else h = ((r - g) / d + 4) / 6;
                                                    }
                                                    return Math.round(h * 360);
                                                })()}
                                                onChange={(e) => {
                                                    const hue = parseInt(e.target.value);
                                                    // Preserve current saturation and lightness
                                                    const hex = customHex.replace('#', '');
                                                    const r = parseInt(hex.substr(0, 2), 16) / 255;
                                                    const g = parseInt(hex.substr(2, 2), 16) / 255;
                                                    const b = parseInt(hex.substr(4, 2), 16) / 255;
                                                    const max = Math.max(r, g, b), min = Math.min(r, g, b);
                                                    const l = (max + min) / 2;
                                                    const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);

                                                    // Convert back to RGB
                                                    const h = hue / 360;
                                                    const hue2rgb = (p: number, q: number, t: number) => {
                                                        if (t < 0) t += 1; if (t > 1) t -= 1;
                                                        if (t < 1 / 6) return p + (q - p) * 6 * t;
                                                        if (t < 1 / 2) return q;
                                                        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                                                        return p;
                                                    };
                                                    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                                                    const p = 2 * l - q;
                                                    const newR = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
                                                    const newG = Math.round(hue2rgb(p, q, h) * 255);
                                                    const newB = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
                                                    setCustomHex('#' + [newR, newG, newB].map(x => x.toString(16).padStart(2, '0')).join(''));
                                                }}
                                            />
                                        </div>

                                        {/* Saturation Slider */}
                                        <div className="color-slider-section">
                                            <label>Saturation</label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                className="saturation-slider"
                                                value={(() => {
                                                    const hex = customHex.replace('#', '');
                                                    if (hex.length !== 6) return 70;
                                                    const r = parseInt(hex.substr(0, 2), 16) / 255;
                                                    const g = parseInt(hex.substr(2, 2), 16) / 255;
                                                    const b = parseInt(hex.substr(4, 2), 16) / 255;
                                                    const max = Math.max(r, g, b), min = Math.min(r, g, b);
                                                    const l = (max + min) / 2;
                                                    return max === min ? 0 : Math.round((l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)) * 100);
                                                })()}
                                                onChange={(e) => {
                                                    const newS = parseInt(e.target.value) / 100;
                                                    const hex = customHex.replace('#', '');
                                                    const r = parseInt(hex.substr(0, 2), 16) / 255;
                                                    const g = parseInt(hex.substr(2, 2), 16) / 255;
                                                    const b = parseInt(hex.substr(4, 2), 16) / 255;
                                                    const max = Math.max(r, g, b), min = Math.min(r, g, b);
                                                    let h = 0;
                                                    if (max !== min) {
                                                        const d = max - min;
                                                        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                                                        else if (max === g) h = ((b - r) / d + 2) / 6;
                                                        else h = ((r - g) / d + 4) / 6;
                                                    }
                                                    const l = (max + min) / 2;

                                                    const hue2rgb = (p: number, q: number, t: number) => {
                                                        if (t < 0) t += 1; if (t > 1) t -= 1;
                                                        if (t < 1 / 6) return p + (q - p) * 6 * t;
                                                        if (t < 1 / 2) return q;
                                                        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                                                        return p;
                                                    };
                                                    const q = l < 0.5 ? l * (1 + newS) : l + newS - l * newS;
                                                    const p = 2 * l - q;
                                                    const newR = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
                                                    const newG = Math.round(hue2rgb(p, q, h) * 255);
                                                    const newB = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
                                                    setCustomHex('#' + [newR, newG, newB].map(x => x.toString(16).padStart(2, '0')).join(''));
                                                }}
                                            />
                                        </div>

                                        {/* Lightness Slider - Black to White */}
                                        <div className="color-slider-section">
                                            <label>Lightness</label>
                                            <input
                                                type="range"
                                                min="10"
                                                max="90"
                                                className="lightness-slider"
                                                style={{ background: 'linear-gradient(to right, #000, #888, #fff)' }}
                                                value={(() => {
                                                    const hex = customHex.replace('#', '');
                                                    if (hex.length !== 6) return 50;
                                                    const r = parseInt(hex.substr(0, 2), 16) / 255;
                                                    const g = parseInt(hex.substr(2, 2), 16) / 255;
                                                    const b = parseInt(hex.substr(4, 2), 16) / 255;
                                                    const max = Math.max(r, g, b), min = Math.min(r, g, b);
                                                    return Math.round((max + min) / 2 * 100);
                                                })()}
                                                onChange={(e) => {
                                                    const newL = parseInt(e.target.value) / 100;
                                                    const hex = customHex.replace('#', '');
                                                    const r = parseInt(hex.substr(0, 2), 16) / 255;
                                                    const g = parseInt(hex.substr(2, 2), 16) / 255;
                                                    const b = parseInt(hex.substr(4, 2), 16) / 255;
                                                    const max = Math.max(r, g, b), min = Math.min(r, g, b);
                                                    let h = 0;
                                                    if (max !== min) {
                                                        const d = max - min;
                                                        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                                                        else if (max === g) h = ((b - r) / d + 2) / 6;
                                                        else h = ((r - g) / d + 4) / 6;
                                                    }
                                                    const l = (max + min) / 2;
                                                    const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);

                                                    const hue2rgb = (p: number, q: number, t: number) => {
                                                        if (t < 0) t += 1; if (t > 1) t -= 1;
                                                        if (t < 1 / 6) return p + (q - p) * 6 * t;
                                                        if (t < 1 / 2) return q;
                                                        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                                                        return p;
                                                    };
                                                    const q = newL < 0.5 ? newL * (1 + s) : newL + s - newL * s;
                                                    const p = 2 * newL - q;
                                                    const newR = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
                                                    const newG = Math.round(hue2rgb(p, q, h) * 255);
                                                    const newB = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
                                                    setCustomHex('#' + [newR, newG, newB].map(x => x.toString(16).padStart(2, '0')).join(''));
                                                }}
                                            />
                                        </div>

                                        {/* Hex Input */}
                                        <div className="color-slider-section">
                                            <label>Hex</label>
                                            <input
                                                type="text"
                                                className="hex-input"
                                                value={customHex}
                                                onChange={(e) => {
                                                    let val = e.target.value;
                                                    if (!val.startsWith('#')) val = '#' + val;
                                                    if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                                        setCustomHex(val);
                                                    }
                                                }}
                                                placeholder="#8b5cf6"
                                                maxLength={7}
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-primary apply-color-btn"
                                            onClick={() => {
                                                if (/^#[0-9A-Fa-f]{6}$/.test(customHex)) {
                                                    setNewTagColor(customHex);
                                                    setShowColorWheel(false);
                                                }
                                            }}
                                        >
                                            Apply Color
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label className="custom-checkbox">
                                <input
                                    type="checkbox"
                                    checked={newTagNsfw}
                                    onChange={(e) => setNewTagNsfw(e.target.checked)}
                                />
                                <span className="checkbox-box">
                                    <svg className="checkbox-check" viewBox="0 0 14 11" fill="none">
                                        <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                                <span className="checkbox-label">Mark this tag NSFW</span>
                            </label>
                        </div>

                        <div className="form-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                    setIsCreating(false);
                                    setEditingTag(null);
                                }}
                            >
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary">
                                {editingTag ? 'Save Changes' : 'Create Tag'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Tags List */}
            {tags.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icons.Tag width={48} height={48} /></div>
                    <h2 className="empty-state-title">No tags yet</h2>
                    <p className="empty-state-description">
                        Create tags to organize your manga collection
                    </p>
                </div>
            ) : (
                <div className="tags-grid">
                    {tags.map(tag => (
                        <div
                            key={tag.id}
                            className="tag-card clickable"
                            onClick={() => handleTagClick(tag)}
                        >
                            <div
                                className="tag-color"
                                style={{ backgroundColor: tag.color }}
                            />
                            <div className="tag-info">
                                <h3 className="tag-name">
                                    {tag.name}
                                    {tag.isNsfw && <span className="nsfw-badge">NSFW</span>}
                                </h3>
                                <p className="tag-count">{filteredTagCounts.get(tag.id) ?? tag.count ?? 0} manga</p>
                            </div>

                            <div className="tag-actions">
                                <button
                                    className="btn btn-ghost btn-icon tag-action-btn"
                                    title="Edit"
                                    onClick={(e) => openEditModal(tag, e)}
                                >
                                    <Icons.Edit width={16} height={16} />
                                </button>
                                <button
                                    className="btn btn-ghost btn-icon tag-action-btn delete"
                                    title="Delete"
                                    onClick={(e) => handleDeleteClick(tag, e)}
                                >
                                    <Icons.Trash width={16} height={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmModal
                isOpen={showConfirmDelete}
                title="Delete Tag"
                message={`Are you sure you want to delete the tag "${tagToDelete?.name}"?`}
                confirmLabel="Delete"
                onConfirm={confirmDelete}
                onCancel={() => setShowConfirmDelete(false)}
                isDestructive={true}
            />
        </div>
    );
}

export default Tags;
