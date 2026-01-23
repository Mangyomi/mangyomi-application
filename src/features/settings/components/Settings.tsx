import { useState, useEffect, useMemo } from 'react';
import { useSettingsStore, Theme, ReaderMode, ProxyConfig, ProxyType } from '../stores/settingsStore';
import { useAniListStore } from '../../../stores/anilistStore';
import { useUpdateStore } from '../../../stores/updateStore';
import { useDialog } from '../../../components/ConfirmModal/DialogContext';
import RangeSlider from '../../../components/RangeSlider/RangeSlider';
import { RestoreProgressModal } from '../../../components/RestoreProgressModal/RestoreProgressModal';
import { useMemoryMonitor, formatBytes } from '../../../utils/useMemoryMonitor';
import { Logo } from '../../../components/Logo';
import './Settings.css';

// Icons
const Icons = {
    General: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" fill="currentColor" />
            <path fillRule="evenodd" clipRule="evenodd" d="M20.605 15.0001L22.84 16.2901C23.238 16.5211 23.376 17.0281 23.149 17.4321L21.149 20.8961C20.923 21.2991 20.413 21.4421 20.012 21.2161L17.777 19.9261C17.151 20.4071 16.459 20.8061 15.719 21.1111L15.38 23.6641C15.319 24.1201 14.927 24.4561 14.467 24.4561H10.467C10.007 24.4561 9.615 24.1201 9.554 23.6641L9.215 21.1111C8.475 20.8061 7.783 20.4071 7.157 19.9261L4.922 21.2161C4.522 21.4421 4.012 21.2991 3.785 20.8961L1.785 17.4321C1.558 17.0281 1.697 16.5211 2.094 16.2901L4.329 15.0001C4.24 14.2868 4.19532 13.5673 4.19532 12.8471C4.19532 11.2721 4.24032 10.5521 4.32932 9.83906L2.09432 8.54906C1.69632 8.31806 1.55832 7.81106 1.78532 7.40706L3.78532 3.94306C4.01132 3.54006 4.52132 3.39706 4.92232 3.62306L7.15732 4.91306C7.78332 4.43206 8.47532 4.03306 9.21532 3.72806L9.55432 1.17506C9.61532 0.719063 10.0073 0.383063 10.4673 0.383063H14.4673C14.9273 0.383063 15.3193 0.719063 15.3803 1.17506L15.7193 3.72806C16.4593 4.03306 17.1513 4.43206 17.7773 4.91306L20.0123 3.62306C20.4123 3.39706 20.9233 3.54006 21.1493 3.94306L23.1493 7.40706C23.3763 7.81106 23.2383 8.31806 22.8403 8.54906L20.6053 9.83906C20.6943 10.5521 20.7393 11.2721 20.7393 11.9921C20.7393 12.7121 20.6943 13.4321 20.6053 14.1521V15.0001ZM12 17.0001C14.761 17.0001 17 14.7611 17 12.0001C17 9.23906 14.761 7.00006 12 7.00006C9.239 7.00006 7 9.23906 7 12.0001C7 14.7611 9.239 17.0001 12 17.0001Z" fill="currentColor" />
        </svg>
    ),
    Library: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M3 20H21V22H3V20ZM5 4H9V18H5V4ZM11 4H19V18H11V4Z" fill="currentColor" />
        </svg>
    ),
    Reader: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5.56417C10.5298 3.65545 7.84651 2.37056 4.79373 2.11216C4.38539 2.0776 4.013 2.38712 4.013 2.79815V16.3276C4.013 16.7118 4.34149 17.0142 4.72314 17.051C7.81745 17.3491 10.4287 18.7303 11.7828 20.606C11.9168 20.7915 12.2155 20.7852 12.3421 20.5937C13.6875 18.558 16.2905 17.0984 19.4674 16.9634C19.7573 16.9511 20 16.7126 20 16.4226V2.79367C20 2.39294 19.6456 2.08388 19.2464 2.1643C16.8904 2.63914 13.9113 4.09322 12 5.56417Z" fill="currentColor" />
        </svg>
    ),
    Storage: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M6.99999 2C4.23857 2 1.99999 4.23858 1.99999 7C1.99999 9.76142 4.23857 12 6.99999 12H17C19.7614 12 22 9.76142 22 7C22 4.23858 19.7614 2 17 2H6.99999ZM6.99999 4C5.34313 4 3.99999 5.34315 3.99999 7C3.99999 8.65685 5.34313 10 6.99999 10H17C18.6568 10 20 8.65685 20 7C20 5.34315 18.6568 4 17 4H6.99999ZM6.99846 14C4.23704 14 1.99846 16.2386 1.99846 19C1.99846 21.7614 4.23704 24 6.99846 24H16.9985C19.7599 24 21.9985 21.7614 21.9985 19C21.9985 16.2386 19.7599 14 16.9985 14H6.99846ZM6.99846 16C5.34161 16 3.99846 17.3431 3.99846 19C3.99846 20.6569 5.34161 22 6.99846 22H16.9985C18.6553 22 19.9985 20.6569 19.9985 19C19.9985 17.3431 18.6553 16 16.9985 16H6.99846Z" fill="currentColor" />
            <path d="M6 7C6 6.44772 6.44772 6 7 6H9C9.55228 6 10 6.44772 10 7C10 7.55228 9.55228 8 9 8H7C6.44772 8 6 7.55228 6 7Z" fill="currentColor" />
            <path d="M6.00153 19C6.00153 18.4477 6.44924 18 7.00153 18H9.00153C9.55381 18 10.0015 18.4477 10.0015 19C10.0015 19.5523 9.55381 20 9.00153 20H7.00153C6.44924 20 6.00153 19.5523 6.00153 19Z" fill="currentColor" />
        </svg>
    ),
    Tracking: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3ZM1 12C1 5.92487 5.92487 1 12 1C18.0751 1 23 5.92487 23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12Z" fill="currentColor" />
            <path d="M13 7C13 6.44772 12.5523 6 12 6C11.4477 6 11 6.44772 11 7V12.1649L13.8837 14.881C14.2868 15.2607 14.9229 15.2433 15.3026 14.8402C15.6823 14.4371 15.6649 13.801 15.2618 13.4214L13 11.2917V7Z" fill="currentColor" />
        </svg>
    ),
    Advanced: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M14.6493 2.16075C13.2033 1.56475 11.5853 1.54275 10.1213 2.06275L9.62332 3.46875C9.46732 3.90875 9.06632 4.22075 8.60432 4.26475L7.13532 4.40475C5.72332 4.54075 4.39932 5.17675 3.39532 6.19575L2.34832 7.25375C1.34732 8.26775 0.730321 9.59975 0.605321 11.0188L0.475321 12.4938C0.434321 12.9578 0.125321 13.3618 -0.312679 13.5218L-1.70968 14.0328C-3.16068 14.5638 -4.16868 15.9398 -4.20568 17.5058C-4.22968 18.5298 -3.85868 19.5088 -3.15968 20.2458L3.75432 13.3328C4.53532 12.5518 5.79932 12.5518 6.58032 13.3328C7.36132 14.1138 7.36132 15.3778 6.58032 16.1588L-0.332679 23.0718C0.395321 23.7848 1.36632 24.1708 2.39032 24.1618C3.95532 24.1488 5.34132 23.1508 5.88932 21.7058L6.41732 20.3148C6.58332 19.8778 6.99732 19.5708 7.46632 19.5358L8.95532 19.4248C10.3873 19.3178 11.7313 18.6678 12.7503 17.6338L13.8113 16.5598C14.8283 15.5298 15.4543 14.1758 15.5803 12.7308L15.7113 11.2368C15.7533 10.7678 16.0663 10.3588 16.5103 10.1988L17.9253 9.68775C19.3893 9.15775 20.4073 7.77075 20.4433 6.19575C20.4803 4.54275 19.4703 3.03075 17.9653 2.40975L14.6493 2.16075ZM22.2473 11.7768C22.6863 11.9568 23.0803 11.5628 22.9003 11.1238L19.4973 2.80975C19.3363 2.41675 18.7893 2.39375 18.5953 2.76075C17.6533 4.53875 15.7553 5.76475 13.5653 5.80175C11.3753 5.83975 9.38632 4.71775 8.32432 3.00375C8.07732 2.60575 7.49832 2.57775 7.29132 2.96975L3.38532 10.3478C3.17832 10.7388 3.52032 11.1898 3.94732 11.0858C5.50832 10.7048 7.15932 10.8758 8.60832 11.5948C9.52932 12.0518 10.3413 12.6988 11.0153 13.4888L11.0963 13.5688C11.7963 14.2498 12.4283 15.0688 12.8683 15.9988C13.5603 17.4618 13.7103 19.1248 13.3073 20.6978C13.2003 21.1168 13.6263 21.4888 14.0223 21.3068L22.2473 11.7768Z" fill="currentColor" />
        </svg>
    ),
    Discord: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.2 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09 0 .11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.48-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z" fill="currentColor" />
        </svg>
    ),
    Import: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
    ),
    Processing: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spinning">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
    ),
    Success: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
    ),
    Error: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f44336" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
    ),
    File: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
    ),
    About: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor" />
        </svg>
    ),
    GitHub: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
    ),

    Download: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
    ),
    Network: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor" />
        </svg>
    ),
    ExternalLink: (props: React.SVGProps<SVGSVGElement>) => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
    ),
};

const CATEGORIES = [
    { id: 'general', label: 'General', icon: <Icons.General /> },
    { id: 'library', label: 'Library', icon: <Icons.Library /> },
    { id: 'reader', label: 'Reader', icon: <Icons.Reader /> },
    { id: 'cache', label: 'Storage', icon: <Icons.Storage /> },
    { id: 'network', label: 'Network', icon: <Icons.Network /> },
    { id: 'tracking', label: 'Tracking', icon: <Icons.Tracking /> },
    { id: 'discord', label: 'Discord', icon: <Icons.Discord /> },
    { id: 'backup', label: 'Backup & Restore', icon: <Icons.Storage /> },
    { id: 'advanced', label: 'Advanced', icon: <Icons.Advanced /> },
    { id: 'about', label: 'About', icon: <Icons.About /> },
] as const;

type CategoryId = typeof CATEGORIES[number]['id'];

// Setting item definition for search
interface SettingDef {
    id: string;
    category: CategoryId;
    label: string;
    description: string;
    keywords: string[];
}

const SETTING_DEFINITIONS: SettingDef[] = [
    { id: 'theme', category: 'general', label: 'Theme', description: 'Choose your preferred color theme', keywords: ['dark', 'light', 'system', 'appearance', 'color'] },
    { id: 'nsfw-all', category: 'library', label: 'Hide All NSFW Content', description: 'Completely hide manga from NSFW sources', keywords: ['nsfw', 'adult', 'filter', 'hide', 'content'] },
    { id: 'nsfw-library', category: 'library', label: 'Hide in Library', description: 'Hide NSFW manga in the Library view', keywords: ['nsfw', 'library', 'filter'] },
    { id: 'nsfw-history', category: 'library', label: 'Hide in History', description: 'Hide NSFW manga in reading history', keywords: ['nsfw', 'history', 'filter'] },
    { id: 'nsfw-tags', category: 'library', label: 'Hide in Tags', description: 'Hide NSFW manga in tag views', keywords: ['nsfw', 'tags', 'filter'] },
    { id: 'reader-mode', category: 'reader', label: 'Default Reader Mode', description: 'Set the default reading mode for chapters', keywords: ['vertical', 'horizontal', 'scroll', 'reading'] },
    { id: 'prefetch', category: 'reader', label: 'Chapter Prefetch', description: 'Preload adjacent chapters for faster navigation', keywords: ['preload', 'performance', 'speed'] },
    { id: 'adaptive-prefetch', category: 'reader', label: 'Adaptive Prefetch', description: 'Learns your reading speed and prefetches pages just before you need them', keywords: ['adaptive', 'smart', 'speed', 'beta', 'rate limit'] },
    { id: 'cache-size', category: 'cache', label: 'Max Cache Size', description: 'Limit disk space for offline images', keywords: ['storage', 'disk', 'space', 'limit'] },
    { id: 'ignore-cache-limit-prefetch', category: 'cache', label: 'Ignore Cache Limit for Prefetching', description: 'Allow prefetch to bypass cache size limit', keywords: ['prefetch', 'cache', 'limit', 'bypass', 'offline', 'download'] },
    { id: 'clear-cache', category: 'cache', label: 'Clear Cache', description: 'Delete all cached images and browser data', keywords: ['clear', 'delete', 'clean'] },
    { id: 'proxies', category: 'network', label: 'Proxies', description: 'Configure proxies for parallel prefetch requests', keywords: ['proxy', 'network', 'ip', 'port', 'socks', 'http', 'prefetch'] },
    { id: 'anilist', category: 'tracking', label: 'AniList', description: 'Sync reading progress with AniList', keywords: ['anilist', 'sync', 'tracking', 'progress'] },
    { id: 'discord', category: 'discord', label: 'Discord Rich Presence', description: 'Show what you are reading on Discord', keywords: ['discord', 'rpc', 'presence', 'status', 'tracking'] },
    { id: 'discord-nsfw', category: 'discord', label: 'Hide NSFW from Discord', description: 'Do not show NSFW titles on Discord status', keywords: ['discord', 'nsfw', 'hide', 'privacy'] },
    { id: 'discord-strict', category: 'discord', label: 'Strict NSFW Detection', description: 'Treat all content from NSFW extensions (e.g. HentaiForce) as NSFW', keywords: ['discord', 'nsfw', 'strict', 'extension'] },
    { id: 'restore-backup', category: 'backup', label: 'Restore from Tachiyomi', description: 'Import library and history from Tachiyomi backup file', keywords: ['backup', 'restore', 'import', 'tachiyomi'] },
    { id: 'clean-library', category: 'backup', label: 'Clean Library', description: 'Remove all entries from library', keywords: ['clean', 'delete', 'remove', 'library', 'clear', 'reset'] },
    { id: 'log-level', category: 'advanced', label: 'Log Level', description: 'Control logging verbosity for debugging', keywords: ['log', 'logging', 'debug', 'verbose', 'console'] },
    { id: 'debug-log', category: 'advanced', label: 'Create Debug Log', description: 'Generate log file for troubleshooting', keywords: ['debug', 'log', 'error', 'support'] },
    { id: 'developer-mode', category: 'advanced', label: 'Developer Mode', description: 'Enable advanced features like extension sideloading', keywords: ['developer', 'dev', 'sideload', 'extension'] },
    { id: 'memory-monitor', category: 'advanced', label: 'Memory Monitor', description: 'Monitor memory usage for debugging leaks', keywords: ['memory', 'leak', 'ram', 'heap', 'debug'] },
    { id: 'about-version', category: 'about', label: 'Version', description: 'Current app version', keywords: ['version', 'about', 'info'] },
    { id: 'about-github', category: 'about', label: 'GitHub', description: 'View source code on GitHub', keywords: ['github', 'source', 'code', 'repository'] },
    { id: 'about-update', category: 'about', label: 'Check for Updates', description: 'Check if a newer version is available', keywords: ['update', 'upgrade', 'new', 'version'] },
    { id: 'about-beta', category: 'about', label: 'Beta Updates', description: 'Receive nightly/beta releases', keywords: ['beta', 'nightly', 'preview', 'experimental'] },
];

function Settings() {
    const [cacheSize, setCacheSize] = useState<number>(0);
    const [activeCategory, setActiveCategory] = useState<CategoryId>('general');
    const [searchQuery, setSearchQuery] = useState('');
    const [memoryMonitorEnabled, setMemoryMonitorEnabled] = useState(false);
    const { stats: memoryStats } = useMemoryMonitor(memoryMonitorEnabled);
    const dialog = useDialog();
    const [backupViewerData, setBackupViewerData] = useState<{
        fileName?: string;
        exportedAt?: string;
        stats?: { manga: number; tags: number; chapters: number; history: number };
        data?: any;
    } | null>(null);
    const [backupViewerTab, setBackupViewerTab] = useState<'manga' | 'tags' | 'chapters' | 'history'>('manga');
    const [importModalData, setImportModalData] = useState<{
        filePath: string;
        fileName: string;
        stats: { manga: number; tags: number; chapters: number; history: number; extensions: number };
    } | null>(null);
    const [importOptions, setImportOptions] = useState<{
        manga: boolean;
        tags: boolean;
        chapters: boolean;
        history: boolean;
        extensions: boolean;
        mergeStrategy: 'keep' | 'overwrite';
    }>({
        manga: true,
        tags: true,
        chapters: true,
        history: true,
        extensions: true,
        mergeStrategy: 'overwrite'
    });

    const [importStatus, setImportStatus] = useState<'idle' | 'processing' | 'completed'>('idle');
    const [importProgress, setImportProgress] = useState<{ status: string; current: number; total: number }>({ status: 'Starting...', current: 0, total: 0 });
    const [importResult, setImportResult] = useState<{ success: boolean; counts?: any; error?: string } | null>(null);

    useEffect(() => {
        window.electronAPI.cache.getSize().then(setCacheSize);
    }, []);

    // Handle pending import file from file association
    useEffect(() => {
        const handlePendingImport = async () => {
            const { usePendingImportStore } = await import('../../../stores/pendingImportStore');
            const store = usePendingImportStore.getState();
            const filePath = store.pendingFilePath;

            if (filePath) {
                // Clear the pending file immediately
                store.clearPendingFilePath();

                // Parse the backup file
                const result = await window.electronAPI.db.parseBackupFile(filePath);

                if (result.success && result.stats && result.fileName) {
                    // Open the import modal
                    setImportModalData({
                        filePath: result.filePath!,
                        fileName: result.fileName,
                        stats: result.stats as any
                    });
                    // Switch to backup category so user sees context
                    setActiveCategory('backup');
                } else {
                    alert(`Failed to parse backup file: ${result.error || 'Unknown error'}`);
                }
            }
        };

        handlePendingImport();

        // Also subscribe to future changes
        const checkStore = setInterval(async () => {
            const { usePendingImportStore } = await import('../../../stores/pendingImportStore');
            const filePath = usePendingImportStore.getState().pendingFilePath;
            if (filePath) {
                handlePendingImport();
            }
        }, 500);

        return () => clearInterval(checkStore);
    }, []);

    const {
        isAuthenticated: isAniListAuthenticated,
        user: anilistUser,
        isLoading: anilistLoading,
        login: anilistLogin,
        logout: anilistLogout,
        loadFromStorage: loadAnilistFromStorage,
    } = useAniListStore();

    useEffect(() => {
        loadAnilistFromStorage();
    }, []);

    // Restore Progress State
    const [isRestoring, setIsRestoring] = useState(false);
    const [restoreStatus, setRestoreStatus] = useState('Initializing...');
    const [restoreProgress, setRestoreProgress] = useState({ current: 0, total: 0 });
    const [isCancellingRestore, setIsCancellingRestore] = useState(false);

    useEffect(() => {
        const cleanup = window.electronAPI.db.onRestoreProgress((_: any, data: any) => {
            setRestoreStatus(data.status);
            setRestoreProgress({ current: data.current, total: data.total });
        });
        return cleanup;
    }, []);

    const handleRestoreCancel = async () => {
        setIsCancellingRestore(true);
        await window.electronAPI.db.cancelRestore();
    };

    const {
        theme, defaultReaderMode, prefetchChapters, maxCacheSize, ignoreCacheLimitForPrefetch, logLevel,
        hideNsfwInLibrary, hideNsfwInHistory, hideNsfwInTags, hideNsfwCompletely, developerMode, betaUpdates,
        discordRpcEnabled, discordRpcHideNsfw, discordRpcStrictNsfw, adaptivePrefetchEnabled,
        proxies, addProxy, removeProxy,
        setTheme, setDefaultReaderMode, setPrefetchChapters, setMaxCacheSize, setIgnoreCacheLimitForPrefetch, setLogLevel,
        setHideNsfwInLibrary, setHideNsfwInHistory, setHideNsfwInTags, setHideNsfwCompletely, setDeveloperMode, setBetaUpdates,
        setDiscordRpcEnabled, setDiscordRpcHideNsfw, setDiscordRpcStrictNsfw, setAdaptivePrefetchEnabled,
    } = useSettingsStore();

    // Update store
    const {
        updateInfo,
        isChecking,
        isDownloading,
        downloadProgress,
        isDownloadComplete,
        checkForUpdates,
        startDownload,
        setDownloadProgress,
        setDownloadComplete,
        installUpdate,
    } = useUpdateStore();

    const [showNoUpdateMessage, setShowNoUpdateMessage] = useState(false);

    // Download progress listeners
    useEffect(() => {
        const cleanupProgress = window.electronAPI.app.onDownloadProgress((_: any, data: any) => {
            setDownloadProgress(data);
        });
        const cleanupComplete = window.electronAPI.app.onDownloadComplete((_: any, data: any) => {
            setDownloadComplete(data.success);
        });
        return () => {
            cleanupProgress();
            cleanupComplete();
        };
    }, [setDownloadProgress, setDownloadComplete]);

    // Fuzzy search filter
    const filteredSettings = useMemo(() => {
        if (!searchQuery.trim()) return null;
        const query = searchQuery.toLowerCase();
        return SETTING_DEFINITIONS.filter(setting =>
            setting.label.toLowerCase().includes(query) ||
            setting.description.toLowerCase().includes(query) ||
            setting.keywords.some(k => k.includes(query))
        );
    }, [searchQuery]);

    const isSearching = searchQuery.trim().length > 0;
    const visibleCategories = isSearching
        ? [...new Set(filteredSettings?.map(s => s.category) || [])]
        : [activeCategory];

    const formatSize = (bytes: number) => {
        if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
        return `${Math.round(bytes / 1024 / 1024)} MB`;
    };

    const themes: { value: Theme; label: string }[] = [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'system', label: 'System' },
    ];

    const readerModes: { value: ReaderMode; label: string }[] = [
        { value: 'vertical', label: 'Vertical Scroll' },
        { value: 'horizontal', label: 'Horizontal Pages' },
    ];

    const shouldShow = (settingId: string) => {
        if (!isSearching) return true;
        return filteredSettings?.some(s => s.id === settingId);
    };

    const renderGeneralSettings = () => (
        <section className="settings-section" data-category="general">
            <h2 className="section-title">General</h2>
            {shouldShow('theme') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Theme</label>
                        <span className="setting-description">Choose your preferred color theme</span>
                    </div>
                    <div className="setting-control">
                        <div className="toggle-group">
                            {themes.map((t) => (
                                <button
                                    key={t.value}
                                    className={`toggle-btn ${theme === t.value ? 'active' : ''}`}
                                    onClick={() => setTheme(t.value)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );

    const renderLibrarySettings = () => (
        <section className="settings-section" data-category="library">
            <h2 className="section-title">Library</h2>
            {shouldShow('nsfw-all') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Hide All NSFW Content</label>
                        <span className="setting-description">Completely hide manga from NSFW sources everywhere</span>
                    </div>
                    <div className="setting-control">
                        <label className="checkbox-switch">
                            <input type="checkbox" checked={hideNsfwCompletely} onChange={(e) => setHideNsfwCompletely(e.target.checked)} />
                            <span className="checkbox-slider"></span>
                        </label>
                    </div>
                </div>
            )}
            <div className={`sub-settings ${hideNsfwCompletely ? 'disabled' : ''}`}>
                {shouldShow('nsfw-library') && (
                    <div className="setting-item sub-item">
                        <div className="setting-info">
                            <label className="setting-label">Hide in Library</label>
                            <span className="setting-description">Hide NSFW manga in the Library "All" view</span>
                        </div>
                        <div className="setting-control">
                            <label className="checkbox-switch">
                                <input type="checkbox" checked={hideNsfwCompletely || hideNsfwInLibrary} disabled={hideNsfwCompletely} onChange={(e) => setHideNsfwInLibrary(e.target.checked)} />
                                <span className="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                )}
                {shouldShow('nsfw-history') && (
                    <div className="setting-item sub-item">
                        <div className="setting-info">
                            <label className="setting-label">Hide in History</label>
                            <span className="setting-description">Hide NSFW manga in your reading history</span>
                        </div>
                        <div className="setting-control">
                            <label className="checkbox-switch">
                                <input type="checkbox" checked={hideNsfwCompletely || hideNsfwInHistory} disabled={hideNsfwCompletely} onChange={(e) => setHideNsfwInHistory(e.target.checked)} />
                                <span className="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                )}
                {shouldShow('nsfw-tags') && (
                    <div className="setting-item sub-item">
                        <div className="setting-info">
                            <label className="setting-label">Hide in Tags</label>
                            <span className="setting-description">Hide NSFW manga in tag views and Tags page</span>
                        </div>
                        <div className="setting-control">
                            <label className="checkbox-switch">
                                <input type="checkbox" checked={hideNsfwCompletely || hideNsfwInTags} disabled={hideNsfwCompletely} onChange={(e) => setHideNsfwInTags(e.target.checked)} />
                                <span className="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );

    const renderReaderSettings = () => (
        <section className="settings-section" data-category="reader">
            <h2 className="section-title">Reader</h2>
            {shouldShow('reader-mode') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Default Reader Mode</label>
                        <span className="setting-description">Set the default reading mode for chapters</span>
                    </div>
                    <div className="setting-control">
                        <div className="toggle-group">
                            {readerModes.map((mode) => (
                                <button
                                    key={mode.value}
                                    className={`toggle-btn ${defaultReaderMode === mode.value ? 'active' : ''}`}
                                    onClick={() => setDefaultReaderMode(mode.value)}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {shouldShow('prefetch') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Chapter Prefetch</label>
                        <span className="setting-description">
                            Preload adjacent chapters for faster navigation.
                            {prefetchChapters === 0 ? ' Currently disabled.' : ` Currently preloading ${prefetchChapters} chapter(s).`}
                        </span>
                    </div>
                    <div className="setting-control">
                        <RangeSlider
                            min={0}
                            max={4}
                            step={1}
                            value={prefetchChapters}
                            onChange={setPrefetchChapters}
                            disabled={adaptivePrefetchEnabled}
                            ticks={[
                                { value: 0, label: 'Off' },
                                { value: 1, label: '1' },
                                { value: 2, label: '2' },
                                { value: 3, label: '3' },
                                { value: 4, label: '4' },
                            ]}
                        />
                    </div>
                </div>
            )}
            {shouldShow('adaptive-prefetch') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">
                            Adaptive Prefetch
                            <span className="beta-badge">Beta</span>
                        </label>
                        <span className="setting-description">
                            Learns your reading speed and prefetches pages just before you need them.
                            Respects source rate limits to avoid getting blocked.
                        </span>
                    </div>
                    <div className="setting-control">
                        <label className="checkbox-switch">
                            <input
                                type="checkbox"
                                checked={adaptivePrefetchEnabled}
                                onChange={(e) => setAdaptivePrefetchEnabled(e.target.checked)}
                            />
                            <span className="checkbox-slider"></span>
                        </label>
                    </div>
                </div>
            )}
            {adaptivePrefetchEnabled && shouldShow('adaptive-prefetch') && (
                <div className="setting-item sub-item align-end">
                    <div className="setting-info">
                        <label className="setting-label">Reset Training Data</label>
                        <span className="setting-description">
                            Clear all learned reading patterns and source rate limits. The system will start learning from scratch.
                        </span>
                    </div>
                    <div className="setting-control">
                        <button className="action-btn danger" onClick={async () => {
                            const result = await dialog.confirm({
                                title: 'Reset Adaptive Training',
                                message: (
                                    <>
                                        <p>This will permanently delete:</p>
                                        <ul style={{ margin: '12px 0', paddingLeft: '20px' }}>
                                            <li>Learned source rate limits</li>
                                            <li>Request timing patterns</li>
                                            <li>Backoff history for all sources</li>
                                        </ul>
                                        <p style={{ marginTop: '12px', color: 'var(--color-text-secondary)' }}>
                                            Your reading statistics will be preserved.
                                        </p>
                                        <p style={{ color: 'var(--color-error)', fontWeight: 500, marginTop: '16px' }}>
                                            ⚠️ This action is irreversible.
                                        </p>
                                    </>
                                ),
                                confirmLabel: 'Reset Training',
                                isDestructive: true,
                                checkboxLabel: 'I understand this cannot be undone',
                                requireCheckbox: true,
                            });
                            if (result?.confirmed || result === true) {
                                await window.electronAPI.db.clearAdaptiveTraining();
                            }
                        }}>Reset Training</button>
                    </div>
                </div>
            )}
        </section>
    );

    const renderCacheSettings = () => (
        <section className="settings-section" data-category="cache">
            <h2 className="section-title">Storage</h2>
            {shouldShow('cache-size') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Max Cache Size</label>
                        <span className="setting-description">
                            Limit the disk space used for offline images. Currently set to <strong>{formatSize(maxCacheSize || 1024 * 1024 * 1024)}</strong>.
                        </span>
                    </div>
                    <div className="setting-control">
                        <RangeSlider
                            min={256 * 1024 * 1024}
                            max={8 * 1024 * 1024 * 1024}
                            step={256 * 1024 * 1024}
                            value={maxCacheSize || 1024 * 1024 * 1024}
                            onChange={setMaxCacheSize}
                            ticks={[
                                { value: 256 * 1024 * 1024, label: '256MB' },
                                { value: 4 * 1024 * 1024 * 1024, label: '4GB' },
                                { value: 8 * 1024 * 1024 * 1024, label: '8GB' },
                            ]}
                        />
                    </div>
                </div>
            )}
            {shouldShow('ignore-cache-limit-prefetch') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Ignore Cache Limit for Prefetching</label>
                        <span className="setting-description">
                            Allow bulk prefetch operations to bypass the cache size limit. Useful for downloading entire series for offline reading.
                        </span>
                    </div>
                    <div className="setting-control">
                        <label className="checkbox-switch">
                            <input type="checkbox" checked={ignoreCacheLimitForPrefetch} onChange={(e) => setIgnoreCacheLimitForPrefetch(e.target.checked)} />
                            <span className="checkbox-slider"></span>
                        </label>
                    </div>
                </div>
            )}
            {shouldShow('clear-cache') && (
                <div className="setting-item align-end">
                    <div className="setting-info">
                        <label className="setting-label">Clear Cache</label>
                        <span className="setting-description">Current cache size: <strong>{formatSize(cacheSize)}</strong>. Clears all cached images.</span>
                    </div>
                    <div className="setting-control">
                        <button className="action-btn danger" onClick={async () => {
                            const confirmed = await dialog.confirm({ title: 'Clear Cache', message: 'Delete all cached data?' });
                            if (confirmed) {
                                await window.electronAPI.cache.clear();
                                setCacheSize(0);
                            }
                        }}>Clear Cache</button>
                    </div>
                </div>
            )}
        </section>
    );

    // Proxy form state
    const [proxyType, setProxyType] = useState<ProxyType>('http');
    const [proxyIp, setProxyIp] = useState('');
    const [proxyPort, setProxyPort] = useState('');
    const [proxyUsername, setProxyUsername] = useState('');
    const [proxyPassword, setProxyPassword] = useState('');
    const [proxySkipValidation, setProxySkipValidation] = useState(false);
    const [proxyValidating, setProxyValidating] = useState(false);
    const [proxyError, setProxyError] = useState<string | null>(null);

    const handleAddProxy = async () => {
        if (!proxyIp || !proxyPort) {
            setProxyError('Please enter both IP and port');
            return;
        }

        const portNum = parseInt(proxyPort, 10);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            setProxyError('Port must be a number between 1 and 65535');
            return;
        }

        // Validate IP format (also allow hostnames)
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        if (!ipRegex.test(proxyIp) && !hostnameRegex.test(proxyIp)) {
            setProxyError('Invalid IP address or hostname');
            return;
        }

        setProxyValidating(true);
        setProxyError(null);

        try {
            const proxyConfig = {
                type: proxyType,
                ip: proxyIp,
                port: portNum,
                username: proxyUsername || undefined,
                password: proxyPassword || undefined
            };

            const result = await window.electronAPI.proxy.validate(proxyConfig, proxySkipValidation);

            if (result.valid) {
                addProxy(proxyConfig);
                setProxyIp('');
                setProxyPort('');
                setProxyUsername('');
                setProxyPassword('');
                setProxyError(null);
            } else {
                setProxyError(result.error || 'Proxy validation failed');
            }
        } catch (err: any) {
            setProxyError(err.message || 'Failed to validate proxy');
        } finally {
            setProxyValidating(false);
        }
    };

    const renderNetworkSettings = () => (
        <section className="settings-section" data-category="network">
            <h2 className="section-title">Network</h2>
            {shouldShow('proxies') && (
                <>
                    <div className="setting-item">
                        <div className="setting-info">
                            <label className="setting-label">Proxies for Prefetch</label>
                            <span className="setting-description">
                                Add proxies to enable parallel prefetch requests. Requests will be distributed randomly across your real IP and configured proxies, with automatic fallback on failure.
                                <br /><br />
                                <strong>Note:</strong> Proxies are only used for background prefetching, <em>not</em> for active reading. Your real IP is always used when you're actively reading.
                            </span>
                        </div>
                    </div>

                    <div className="setting-item">
                        <div className="proxy-form">
                            <div className="proxy-form-row">
                                <select
                                    value={proxyType}
                                    onChange={(e) => setProxyType(e.target.value as ProxyType)}
                                    className="proxy-type-select"
                                >
                                    <option value="http">HTTP/HTTPS</option>
                                    <option value="socks4">SOCKS4</option>
                                    <option value="socks5">SOCKS5</option>
                                </select>
                                <input
                                    type="text"
                                    placeholder="IP or Hostname"
                                    value={proxyIp}
                                    onChange={(e) => setProxyIp(e.target.value)}
                                    className="proxy-ip-input"
                                />
                                <input
                                    type="text"
                                    placeholder="Port"
                                    value={proxyPort}
                                    onChange={(e) => setProxyPort(e.target.value.replace(/\D/g, ''))}
                                    className="proxy-port-input"
                                    maxLength={5}
                                />
                            </div>
                            <div className="proxy-form-row" style={{ marginTop: '12px' }}>
                                <input
                                    type="text"
                                    placeholder="Username (optional)"
                                    value={proxyUsername}
                                    onChange={(e) => setProxyUsername(e.target.value)}
                                    className="proxy-auth-input"
                                />
                                <input
                                    type="password"
                                    placeholder="Password (optional)"
                                    value={proxyPassword}
                                    onChange={(e) => setProxyPassword(e.target.value)}
                                    className="proxy-auth-input"
                                />
                            </div>
                            <div className="proxy-form-row" style={{ marginTop: '12px' }}>
                                <label className="proxy-skip-validation">
                                    <input
                                        type="checkbox"
                                        checked={proxySkipValidation}
                                        onChange={(e) => setProxySkipValidation(e.target.checked)}
                                    />
                                    <span>Skip validation (add without testing)</span>
                                </label>
                                <button
                                    className="action-btn primary"
                                    onClick={handleAddProxy}
                                    disabled={proxyValidating}
                                >
                                    {proxyValidating ? 'Validating...' : 'Add Proxy'}
                                </button>
                            </div>
                            {proxyError && (
                                <div className="proxy-error">{proxyError}</div>
                            )}
                        </div>
                    </div>

                    {proxies.length > 0 && (
                        <div className="setting-item">
                            <div className="proxy-list">
                                <div className="proxy-list-header">
                                    <span>Configured Proxies ({proxies.length})</span>
                                </div>
                                {proxies.map((proxy: ProxyConfig, index: number) => (
                                    <div key={index} className="proxy-item">
                                        <span className="proxy-type-badge">{proxy.type.toUpperCase()}</span>
                                        <span className="proxy-address">
                                            {proxy.username ? `${proxy.username}@` : ''}{proxy.ip}:{proxy.port}
                                        </span>
                                        <button
                                            className="action-btn danger small"
                                            onClick={() => removeProxy(index)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    );

    const renderTrackingSettings = () => (
        <section className="settings-section" data-category="tracking">
            <h2 className="section-title">Tracking</h2>
            {shouldShow('anilist') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">AniList</label>
                        <span className="setting-description">
                            {isAniListAuthenticated && anilistUser ? `Connected as ${anilistUser.name}` : 'Sync your reading progress with AniList'}
                        </span>
                    </div>
                    <div className="setting-control">
                        {isAniListAuthenticated ? (
                            <div className="anilist-user-info">
                                {anilistUser?.avatar?.medium && <img src={anilistUser.avatar.medium} alt={anilistUser.name} className="anilist-avatar" />}
                                <button className="action-btn logout-btn" onClick={async () => {
                                    const confirmed = await dialog.confirm({ title: 'Disconnect AniList?', message: 'Your tracking links will be preserved but progress will no longer sync.' });
                                    if (confirmed) await anilistLogout();
                                }}>Disconnect</button>
                            </div>
                        ) : (
                            <button className="action-btn" onClick={anilistLogin} disabled={anilistLoading}>
                                {anilistLoading ? 'Connecting...' : 'Connect'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </section>
    );

    const renderDiscordSettings = () => (
        <section className="settings-section" data-category="discord">
            <h2 className="section-title">Discord</h2>
            {shouldShow('discord') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Discord Rich Presence</label>
                        <span className="setting-description">Show your current reading activity on your Discord profile</span>
                    </div>
                    <div className="setting-control">
                        <label className="checkbox-switch">
                            <input
                                type="checkbox"
                                checked={discordRpcEnabled}
                                onChange={(e) => setDiscordRpcEnabled(e.target.checked)}
                            />
                            <span className="checkbox-slider"></span>
                        </label>
                    </div>
                </div>
            )}
            <div className={`sub-settings ${!discordRpcEnabled ? 'disabled' : ''}`}>
                {shouldShow('discord-nsfw') && (
                    <div className="setting-item sub-item">
                        <div className="setting-info">
                            <label className="setting-label">Hide NSFW from Discord</label>
                            <span className="setting-description">If enabled, NSFW manga will not be shown on your status (privacy mode)</span>
                        </div>
                        <div className="setting-control">
                            <label className="checkbox-switch">
                                <input
                                    type="checkbox"
                                    checked={discordRpcHideNsfw}
                                    disabled={!discordRpcEnabled}
                                    onChange={(e) => setDiscordRpcHideNsfw(e.target.checked)}
                                />
                                <span className="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                )}
                {shouldShow('discord-strict') && (
                    <div className="setting-item sub-item">
                        <div className="setting-info">
                            <label className="setting-label">Strict NSFW Detection</label>
                            <span className="setting-description">Treat all content from NSFW extensions (e.g. HentaiForce) as NSFW, even if not explicitly tagged</span>
                        </div>
                        <div className="setting-control">
                            <label className="checkbox-switch">
                                <input
                                    type="checkbox"
                                    checked={discordRpcStrictNsfw}
                                    disabled={!discordRpcEnabled || !discordRpcHideNsfw}
                                    onChange={(e) => setDiscordRpcStrictNsfw(e.target.checked)}
                                />
                                <span className="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );

    const renderBackupSettings = () => (
        <section className="settings-section" data-category="backup">
            <h2 className="section-title">Backup & Restore</h2>

            <div className="setting-item">
                <div className="setting-info">
                    <label className="setting-label">Export Backup</label>
                    <span className="setting-description">Export your library, tags, and history as a compressed backup file (.mgb)</span>
                </div>
                <div className="setting-control" style={{ display: 'flex', gap: '8px' }}>
                    <button className="action-btn" onClick={async () => {
                        const result = await window.electronAPI.db.exportBackup();
                        if (result.success) {
                            await dialog.alert(result.message || 'Backup exported successfully!', 'Success');
                        } else if (result.message !== 'Export cancelled') {
                            await dialog.alert(result.message || 'Export failed', 'Error');
                        }
                    }}>Export</button>
                    <button className="action-btn secondary" onClick={async () => {
                        const result = await window.electronAPI.db.viewBackup();
                        if (result.success && result.stats) {
                            setImportModalData({
                                filePath: result.filePath!,
                                fileName: result.fileName!,
                                stats: result.stats! as any
                            });
                        } else if (result.error && !result.cancelled) {
                            await dialog.alert(result.error, 'Error');
                        }
                    }}>Import</button>
                    <button className="action-btn secondary" onClick={async () => {
                        const result = await window.electronAPI.db.viewBackup();
                        if (result.success && result.stats) {
                            setBackupViewerData({
                                fileName: result.fileName,
                                exportedAt: result.exportedAt,
                                stats: result.stats,
                                data: result.data
                            });
                        } else if (result.error) {
                            await dialog.alert(result.error, 'Error');
                        }
                    }}>View</button>
                </div>
            </div>

            {shouldShow('restore-backup') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Restore from Tachiyomi</label>
                        <span className="setting-description">Import library, chapters, and history from a Tachiyomi backup file (.tachibk or .proto.gz)</span>
                    </div>
                    <div className="setting-control">
                        <button className="action-btn" onClick={async () => {
                            setIsRestoring(true);
                            setRestoreStatus('Waiting for file selection...');
                            setRestoreProgress({ current: 0, total: 0 });
                            setIsCancellingRestore(false);

                            try {
                                const result = await window.electronAPI.db.triggerRestore();
                                setIsRestoring(false);

                                if (result.success) {
                                    await dialog.alert(
                                        `Successfully imported ${result.count} entries!\n(${result.libraryCount ?? 0} added to Library)`,
                                        'Restore Complete'
                                    );
                                    window.location.reload();
                                } else if (result.message !== 'Restore cancelled') {
                                    await dialog.alert(`Restore failed: ${result.message}`, 'Error');
                                }
                            } catch (error) {
                                setIsRestoring(false);
                                console.error(error);
                                await dialog.alert('An unexpected error occurred during restore.', 'Error');
                            }
                        }}>Restore Backup</button>
                    </div>
                </div>
            )}
            <RestoreProgressModal
                isOpen={isRestoring}
                status={restoreStatus}
                current={restoreProgress.current}
                total={restoreProgress.total}
                onCancel={handleRestoreCancel}
                isCancelling={isCancellingRestore}
            />

            {shouldShow('clean-library') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label text-danger" style={{ color: '#ff4444' }}>Clean Library</label>
                        <span className="setting-description">Use this to remove all entries from your library. <strong>This action is irreversible.</strong></span>
                    </div>
                    <div className="setting-control">
                        <button className="action-btn danger" style={{ backgroundColor: '#ff4444', color: 'white' }} onClick={async () => {
                            const result = await dialog.confirm({
                                title: 'Clean Library?',
                                message: `Are you sure you want to remove all entries from your library? This action cannot be undone.`,
                                checkboxLabel: 'Delete tags from these entries too',
                                checkbox2Label: 'Clear reading history too',
                                isDestructive: true
                            });

                            const confirmed = typeof result === 'object' ? result.confirmed : result;
                            const shouldDeleteTags = typeof result === 'object' ? result.isChecked : false;
                            const shouldClearHistory = typeof result === 'object' ? result.isChecked2 : false;

                            if (confirmed) {
                                await window.electronAPI.db.cleanLibrary(shouldDeleteTags);
                                if (shouldClearHistory) {
                                    await window.electronAPI.db.clearAllHistory();
                                }
                                await dialog.alert('Library cleaned successfully.', 'Success');
                                window.location.reload();
                            }
                        }}>Clean Library</button>
                    </div>
                </div>
            )}

            <div className="setting-item">
                <div className="setting-info">
                    <label className="setting-label" style={{ color: 'var(--color-error)' }}>Clear All Data</label>
                    <span className="setting-description">Completely reset the database. This will delete ALL your manga, tags, history, and settings.</span>
                </div>
                <div className="setting-control">
                    <button className="action-btn danger" onClick={async () => {
                        const firstConfirm = await dialog.confirm({
                            title: '⚠️ Clear All Data?',
                            message: 'This will PERMANENTLY DELETE all your data:\n\n• All manga in your library\n• All tags and categories\n• All reading history\n• All settings\n\nThis action is IRREVERSIBLE!',
                        });
                        if (firstConfirm) {
                            const secondConfirm = await dialog.confirm({
                                title: '🚨 Are you absolutely sure?',
                                message: 'Type "DELETE" in your mind and click confirm to proceed.\n\nYour database will be completely erased.',
                            });
                            if (secondConfirm) {
                                await window.electronAPI.db.clearAllData();
                                await dialog.alert('Database cleared. The app will now reload.', 'Reset Complete');
                                window.location.reload();
                            }
                        }
                    }}>Clear All</button>
                </div>
            </div>
        </section>
    );

    const renderAdvancedSettings = () => (
        <section className="settings-section" data-category="advanced">
            <h2 className="section-title">Advanced</h2>
            {shouldShow('log-level') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Log Level</label>
                        <span className="setting-description">
                            Control logging verbosity. {logLevel === 'error' ? 'Errors only' : logLevel === 'warn' ? 'Warnings and errors' : logLevel === 'info' ? 'Basic info (recommended)' : logLevel === 'debug' ? 'Detailed debug info' : 'All logs (verbose)'}
                        </span>
                    </div>
                    <div className="setting-control">
                        <div className="toggle-group">
                            {[
                                { value: 'error', label: 'ERROR' },
                                { value: 'warn', label: 'WARN' },
                                { value: 'info', label: 'INFO' },
                                { value: 'debug', label: 'DEBUG' },
                                { value: 'verbose', label: 'VERBOSE' },
                            ].map((level) => (
                                <button
                                    key={level.value}
                                    className={`toggle-btn ${logLevel === level.value ? 'active' : ''}`}
                                    onClick={() => setLogLevel(level.value as any)}
                                >
                                    {level.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {shouldShow('developer-mode') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Developer Mode</label>
                        <span className="setting-description">Enable advanced features like extension sideloading</span>
                    </div>
                    <div className="setting-control">
                        <label className="checkbox-switch">
                            <input
                                type="checkbox"
                                checked={developerMode}
                                onChange={(e) => setDeveloperMode(e.target.checked)}
                            />
                            <span className="checkbox-slider"></span>
                        </label>
                    </div>
                </div>
            )}
            {shouldShow('debug-log') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Create Debug Log</label>
                        <span className="setting-description">Generate a log file with system info for troubleshooting</span>
                    </div>
                    <div className="setting-control">
                        <button className="action-btn" onClick={async () => {
                            try {
                                const { debugLogger } = await import('../../../utils/debugLogger');
                                const consoleLogs = debugLogger.getFormattedLogs();
                                const networkActivity = debugLogger.getFormattedNetwork();
                                await window.electronAPI.app.createDumpLog(consoleLogs, networkActivity);
                                await dialog.alert('Debug log created! Opening in Explorer...', 'Success');
                            } catch (err: any) {
                                console.error('Debug log error:', err);
                                await dialog.alert(`Error: ${err.message || 'Unknown error'}`, 'Error');
                            }
                        }}>Generate Log</button>
                    </div>
                </div>
            )}
            {shouldShow('memory-monitor') && (
                <>
                    <div className="setting-item">
                        <div className="setting-info">
                            <label className="setting-label">Memory Monitor</label>
                            <span className="setting-description">Monitor memory usage to help diagnose memory leaks</span>
                        </div>
                        <div className="setting-control">
                            <label className="checkbox-switch">
                                <input
                                    type="checkbox"
                                    checked={memoryMonitorEnabled}
                                    onChange={(e) => setMemoryMonitorEnabled(e.target.checked)}
                                />
                                <span className="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    {memoryMonitorEnabled && memoryStats.main && (
                        <div className="memory-stats-panel">
                            <div className="memory-stats-row">
                                <span className="memory-label">Main Process</span>
                                <div className="memory-values">
                                    <span>Heap: <strong>{formatBytes(memoryStats.main.current.heapUsed)}</strong> / {formatBytes(memoryStats.main.current.heapTotal)}</span>
                                    <span>RSS: <strong>{formatBytes(memoryStats.main.current.rss)}</strong></span>
                                </div>
                            </div>
                            {memoryStats.renderer && (
                                <div className="memory-stats-row">
                                    <span className="memory-label">Renderer</span>
                                    <div className="memory-values">
                                        <span>Heap: <strong>{formatBytes(memoryStats.renderer.usedJSHeapSize)}</strong> / {formatBytes(memoryStats.renderer.totalJSHeapSize)}</span>
                                    </div>
                                </div>
                            )}
                            <div className="memory-stats-row">
                                <span className="memory-label">Trend</span>
                                <span className={`memory-trend memory-trend-${memoryStats.main.trend}`}>
                                    {memoryStats.main.trend === 'growing' ? '📈 Growing' :
                                        memoryStats.main.trend === 'shrinking' ? '📉 Shrinking' : '➡️ Stable'}
                                </span>
                            </div>
                            {memoryStats.main.leakWarning && (
                                <div className="memory-leak-warning">
                                    ⚠️ Possible memory leak detected! Memory is continuously growing.
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </section>
    );

    const renderAboutSettings = () => (
        <section className="settings-section" data-category="about">
            <h2 className="section-title">About</h2>

            {shouldShow('about-version') && (
                <div className="setting-item about-header-item">
                    <div className="about-app-info">
                        <Logo size={48} />
                        <div className="about-app-details">
                            <h3 className="about-app-name">Mangyomi</h3>
                            <span className="about-version">v{APP_VERSION}</span>
                        </div>
                    </div>
                </div>
            )}

            {shouldShow('about-github') && (
                <div className="setting-item clickable" onClick={() => window.electronAPI.app.openExternal('https://github.com/Mangyomi/mangyomi-application')}>
                    <div className="setting-info">
                        <label className="setting-label"><Icons.GitHub /> GitHub Repository</label>
                        <span className="setting-description">View source code, report issues, and contribute</span>
                    </div>
                    <div className="setting-control">
                        <Icons.ExternalLink width={18} height={18} className="external-link-icon" />
                    </div>
                </div>
            )}

            {shouldShow('about-update') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Updates</label>
                        <span className="setting-description">
                            {isDownloading ? (
                                `Downloading... ${downloadProgress?.percent || 0}%`
                            ) : isDownloadComplete ? (
                                'Download complete! Ready to install.'
                            ) : updateInfo?.hasUpdate ? (
                                `New version available: v${updateInfo.latestVersion}`
                            ) : showNoUpdateMessage ? (
                                "You're using the latest version!"
                            ) : (
                                'Check if a newer version is available'
                            )}
                        </span>
                        {isDownloading && downloadProgress && (
                            <div className="download-progress-bar">
                                <div
                                    className="download-progress-fill"
                                    style={{ width: `${downloadProgress.percent}%` }}
                                />
                            </div>
                        )}
                    </div>
                    <div className="setting-control">
                        {isDownloadComplete ? (
                            <button className="action-btn primary" onClick={installUpdate}>
                                Install Now
                            </button>
                        ) : isDownloading ? (
                            <button className="action-btn" disabled>
                                Downloading...
                            </button>
                        ) : updateInfo?.hasUpdate ? (
                            <button className="action-btn primary" onClick={startDownload}>
                                Download Update
                            </button>
                        ) : (
                            <button
                                className="action-btn"
                                disabled={isChecking}
                                onClick={async () => {
                                    setShowNoUpdateMessage(false);
                                    const result = await checkForUpdates(betaUpdates);
                                    if (result && !result.hasUpdate && !result.error) {
                                        setShowNoUpdateMessage(true);
                                    }
                                }}
                            >
                                {isChecking ? 'Checking...' : 'Check for Updates'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {shouldShow('about-beta') && (
                <div className="setting-item">
                    <div className="setting-info">
                        <label className="setting-label">Beta Updates</label>
                        <span className="setting-description">
                            {betaUpdates
                                ? 'You are receiving nightly/beta releases'
                                : 'Receive early access to new features (may be unstable)'}
                        </span>
                    </div>
                    <div className="setting-control">
                        <label className="checkbox-switch">
                            <input
                                type="checkbox"
                                checked={betaUpdates}
                                onChange={async (e) => {
                                    if (e.target.checked) {
                                        const confirmed = await dialog.confirm({
                                            title: 'Enable Beta Updates?',
                                            message: 'Beta/nightly releases are updated frequently and may contain bugs or incomplete features. Are you sure you want to receive beta updates?',
                                            confirmLabel: 'Enable Beta',
                                            isDestructive: true
                                        });
                                        if (confirmed) {
                                            setBetaUpdates(true);
                                        }
                                    } else {
                                        setBetaUpdates(false);
                                    }
                                }}
                            />
                            <span className="checkbox-slider"></span>
                        </label>
                    </div>
                </div>
            )}
        </section>
    );

    const categoryRenderers: Record<CategoryId, () => JSX.Element> = {
        general: renderGeneralSettings,
        library: renderLibrarySettings,
        reader: renderReaderSettings,
        cache: renderCacheSettings,
        network: renderNetworkSettings,
        tracking: renderTrackingSettings,
        discord: renderDiscordSettings,
        backup: renderBackupSettings,
        advanced: renderAdvancedSettings,
        about: renderAboutSettings,
    };

    return (
        <div className="settings-page">
            <div className="settings-header">
                <h1>Settings</h1>
                <div className="settings-search">
                    <input
                        type="text"
                        placeholder="Search settings..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                    {searchQuery && (
                        <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>
                    )}
                </div>
            </div>

            <div className="settings-layout">
                {!isSearching && (
                    <nav className="settings-sidebar">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                className={`sidebar-item ${activeCategory === cat.id ? 'active' : ''}`}
                                onClick={() => setActiveCategory(cat.id)}
                            >
                                <span className="sidebar-icon">{cat.icon}</span>
                                <span className="sidebar-label">{cat.label}</span>
                            </button>
                        ))}
                    </nav>
                )}

                <div className="settings-content">
                    {isSearching ? (
                        filteredSettings?.length === 0 ? (
                            <div className="no-results">No settings found for "{searchQuery}"</div>
                        ) : (
                            visibleCategories.map(catId => categoryRenderers[catId]())
                        )
                    ) : (
                        categoryRenderers[activeCategory]()
                    )}
                </div>
            </div>

            {/* Backup Viewer Modal */}
            {backupViewerData && (
                <div className="backup-viewer-overlay" onClick={() => setBackupViewerData(null)}>
                    <div className="backup-viewer-modal" onClick={e => e.stopPropagation()}>
                        <div className="backup-viewer-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Icons.File /> {backupViewerData.fileName}
                            </h3>
                            <button className="close-btn" onClick={() => setBackupViewerData(null)}>×</button>
                        </div>

                        <div className="backup-viewer-info">
                            <p className="backup-date">Exported: {backupViewerData.exportedAt ? new Date(backupViewerData.exportedAt).toLocaleString() : 'Unknown'}</p>
                        </div>

                        <div className="backup-stats-grid">
                            <div className={`backup-stat-card ${backupViewerTab === 'manga' ? 'active' : ''}`} onClick={() => setBackupViewerTab('manga')}>
                                <span className="stat-value">{backupViewerData.stats?.manga || 0}</span>
                                <span className="stat-label">Manga</span>
                            </div>
                            <div className={`backup-stat-card ${backupViewerTab === 'tags' ? 'active' : ''}`} onClick={() => setBackupViewerTab('tags')}>
                                <span className="stat-value">{backupViewerData.stats?.tags || 0}</span>
                                <span className="stat-label">Tags</span>
                            </div>
                            <div className={`backup-stat-card ${backupViewerTab === 'chapters' ? 'active' : ''}`} onClick={() => setBackupViewerTab('chapters')}>
                                <span className="stat-value">{backupViewerData.stats?.chapters || 0}</span>
                                <span className="stat-label">Chapters</span>
                            </div>
                            <div className={`backup-stat-card ${backupViewerTab === 'history' ? 'active' : ''}`} onClick={() => setBackupViewerTab('history')}>
                                <span className="stat-value">{backupViewerData.stats?.history || 0}</span>
                                <span className="stat-label">History</span>
                            </div>
                        </div>

                        {backupViewerTab === 'manga' && backupViewerData.data?.manga && (
                            <div className="backup-content-list">
                                <h4>Manga ({backupViewerData.data.manga.length})</h4>
                                <div className="list-scroll">
                                    {backupViewerData.data.manga.slice(0, 100).map((m: any, i: number) => (
                                        <div key={i} className="list-item">
                                            <span className="item-title">{m.title}</span>
                                            <span className="item-subtitle">{m.source_id}</span>
                                        </div>
                                    ))}
                                    {backupViewerData.data.manga.length > 100 && (
                                        <div className="more-items">...and {backupViewerData.data.manga.length - 100} more</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {backupViewerTab === 'tags' && backupViewerData.data?.tags && (
                            <div className="backup-content-list">
                                <h4>Tags ({backupViewerData.data.tags.length})</h4>
                                <div className="list-scroll">
                                    {backupViewerData.data.tags.map((t: any, i: number) => (
                                        <div key={i} className="list-item">
                                            <div className="tag-preview" style={{
                                                display: 'flex', alignItems: 'center', gap: '8px'
                                            }}>
                                                <span style={{
                                                    width: '12px', height: '12px', borderRadius: '50%',
                                                    background: t.color || 'var(--color-primary)'
                                                }}></span>
                                                <span className="item-title">{t.name}</span>
                                            </div>
                                            {t.is_nsfw === 1 && <span className="tag-nsfw">NSFW</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {backupViewerTab === 'chapters' && backupViewerData.data?.chapters && (
                            <div className="backup-content-list">
                                <h4>Chapters ({backupViewerData.data.chapters.length})</h4>
                                <div className="list-scroll">
                                    {(() => {
                                        // Group chapters by manga_id
                                        const chaptersByManga = new Map();
                                        backupViewerData.data.chapters.forEach((c: any) => {
                                            const count = chaptersByManga.get(c.manga_id) || 0;
                                            chaptersByManga.set(c.manga_id, count + 1);
                                        });

                                        // Map manga_id to title if available
                                        const mangaMap = new Map();
                                        if (backupViewerData.data.manga) {
                                            backupViewerData.data.manga.forEach((m: any) => {
                                                mangaMap.set(m.id, m.title);
                                            });
                                        }

                                        return Array.from(chaptersByManga.entries()).slice(0, 100).map(([mangaId, count], i) => {
                                            const title = mangaMap.get(mangaId) || `ID: ${mangaId}`;
                                            return (
                                                <div key={i} className="list-item">
                                                    <span className="item-title">{title}</span>
                                                    <span className="item-subtitle">{count} chapters</span>
                                                </div>
                                            );
                                        });
                                    })()}
                                    {new Set(backupViewerData.data.chapters.map((c: any) => c.manga_id)).size > 100 && (
                                        <div className="more-items">...and more</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {backupViewerTab === 'history' && backupViewerData.data?.history && (
                            <div className="backup-content-list">
                                <h4>History ({backupViewerData.data.history.length})</h4>
                                <div className="list-scroll">
                                    {(() => {
                                        // Map chapter_id to manga_id, then manga_id to title
                                        const chapterMap = new Map();
                                        if (backupViewerData.data.chapters) {
                                            backupViewerData.data.chapters.forEach((c: any) => {
                                                chapterMap.set(c.id, c.manga_id);
                                            });
                                        }

                                        const mangaMap = new Map();
                                        if (backupViewerData.data.manga) {
                                            backupViewerData.data.manga.forEach((m: any) => {
                                                mangaMap.set(m.id, m.title);
                                            });
                                        }

                                        return backupViewerData.data.history.slice(0, 100).map((h: any, i: number) => {
                                            const mangaId = chapterMap.get(h.chapter_id);
                                            const title = mangaId ? (mangaMap.get(mangaId) || 'Unknown Manga') : 'Unknown Chapter';
                                            const date = new Date(h.read_at * 1000).toLocaleDateString();
                                            return (
                                                <div key={i} className="list-item">
                                                    <span className="item-title">{title}</span>
                                                    <span className="item-subtitle">Read on {date}</span>
                                                </div>
                                            );
                                        });
                                    })()}
                                    {backupViewerData.data.history.length > 100 && (
                                        <div className="more-items">...and {backupViewerData.data.history.length - 100} more</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Import Options Modal */}
            {importModalData && (
                <div className="backup-viewer-overlay" onClick={() => {
                    if (importStatus !== 'processing') {
                        setImportModalData(null);
                        setImportStatus('idle');
                        setImportResult(null);
                    }
                }}>
                    <div
                        className={`backup-viewer-modal ${importStatus === 'processing' ? 'processing' : ''}`}
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: '400px',
                            transition: 'transform 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            transform: importStatus === 'processing' ? 'scale(0.92)' : 'scale(1)'
                        }}
                    >
                        <div className="backup-viewer-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {importStatus === 'idle' && <><Icons.Import /> Import Backup</>}
                                {importStatus === 'processing' && <><Icons.Processing /> Importing...</>}
                                {importStatus === 'completed' && (importResult?.success ? <><Icons.Success /> Import Complete</> : <><Icons.Error /> Import Failed</>)}
                            </h3>
                            {importStatus !== 'processing' && (
                                <button className="close-btn" onClick={() => {
                                    setImportModalData(null);
                                    setImportStatus('idle');
                                    setImportResult(null);
                                    if (importStatus === 'completed' && importResult?.success) {
                                        window.location.reload();
                                    }
                                }}>×</button>
                            )}
                        </div>

                        {importStatus === 'idle' && (
                            <>
                                <div className="backup-viewer-info">
                                    <p className="backup-date">File: {importModalData.fileName}</p>
                                    <p className="backup-date" style={{ marginTop: '4px' }}>Select data to import:</p>
                                </div>

                                <div className="import-options-list">
                                    <label className="import-option-item">
                                        <input
                                            type="checkbox"
                                            checked={importOptions.manga || importOptions.tags}
                                            disabled={importOptions.tags}
                                            onChange={e => setImportOptions({ ...importOptions, manga: e.target.checked })}
                                        />
                                        <span className="option-label">Manga</span>
                                        <span className="option-count">({importModalData.stats.manga})</span>
                                    </label>
                                    <label className="import-option-item">
                                        <input
                                            type="checkbox"
                                            checked={importOptions.tags}
                                            onChange={e => setImportOptions({ ...importOptions, tags: e.target.checked, manga: e.target.checked ? true : importOptions.manga })}
                                        />
                                        <span className="option-label">Tags</span>
                                        <span className="option-count">({importModalData.stats.tags})</span>
                                    </label>
                                    <label className="import-option-item">
                                        <input
                                            type="checkbox"
                                            checked={importOptions.chapters}
                                            onChange={e => setImportOptions({ ...importOptions, chapters: e.target.checked })}
                                        />
                                        <span className="option-label">Chapters</span>
                                        <span className="option-count">({importModalData.stats.chapters})</span>
                                    </label>
                                    <label className="import-option-item">
                                        <input
                                            type="checkbox"
                                            checked={importOptions.history}
                                            onChange={e => setImportOptions({ ...importOptions, history: e.target.checked })}
                                        />
                                        <span className="option-label">History</span>
                                        <span className="option-count">({importModalData.stats.history})</span>
                                    </label>
                                    <label className="import-option-item">
                                        <input
                                            type="checkbox"
                                            checked={importOptions.extensions}
                                            onChange={e => setImportOptions({ ...importOptions, extensions: e.target.checked })}
                                        />
                                        <span className="option-label">Extensions</span>
                                        <span className="option-count">({importModalData.stats.extensions})</span>
                                    </label>

                                    <div style={{ padding: '12px 0 0 0', marginTop: '12px', borderTop: '1px solid var(--border)' }}>
                                        <label className="import-option-item" style={{ background: 'transparent', padding: '0 12px' }}>
                                            <input
                                                type="checkbox"
                                                checked={importOptions.mergeStrategy === 'overwrite'}
                                                onChange={e => setImportOptions({ ...importOptions, mergeStrategy: e.target.checked ? 'overwrite' : 'keep' })}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span className="option-label">Overwrite existing entries</span>
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>If unchecked, existing items will be skipped</span>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div className="modal-actions" style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                                    <button className="action-btn secondary" onClick={() => setImportModalData(null)} style={{ flex: 1 }}>Cancel</button>
                                    <button className="action-btn" style={{ flex: 1 }} onClick={async () => {
                                        setImportStatus('processing');

                                        // Subscribe to progress
                                        const unsubscribe = window.electronAPI.db.onImportProgress((event, data) => {
                                            setImportProgress(data);
                                        });

                                        try {
                                            const result = await window.electronAPI.db.importBackup({
                                                filePath: importModalData.filePath,
                                                options: importOptions
                                            });
                                            setImportResult(result);
                                            setImportStatus('completed');
                                        } catch (e: any) {
                                            setImportResult({ success: false, error: e.message });
                                            setImportStatus('completed');
                                        } finally {
                                            unsubscribe();
                                        }
                                    }}>Import Selected</button>
                                </div>
                            </>
                        )}

                        {importStatus === 'processing' && (
                            <div className="import-progress-container" style={{ padding: '20px 0', textAlign: 'center' }}>
                                <div className="progress-spinner" style={{
                                    width: '40px', height: '40px',
                                    border: '4px solid var(--border)',
                                    borderTop: '4px solid var(--accent)',
                                    borderRadius: '50%',
                                    margin: '0 auto 20px',
                                    animation: 'spin 1s linear infinite'
                                }}></div>
                                <h4 style={{ marginBottom: '8px' }}>{importProgress.status}</h4>
                                {importProgress.total > 0 && (
                                    <div className="progress-bar-wrapper" style={{
                                        width: '100%', height: '8px', background: 'var(--border)',
                                        borderRadius: '4px', overflow: 'hidden', marginTop: '10px'
                                    }}>
                                        <div className="progress-bar-fill" style={{
                                            width: `${(importProgress.current / importProgress.total) * 100}%`,
                                            height: '100%', background: 'var(--accent)',
                                            transition: 'width 0.2s ease'
                                        }}></div>
                                    </div>
                                )}
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                                    {importProgress.total > 0 ? `${importProgress.current} / ${importProgress.total}` : 'Please wait...'}
                                </p>
                            </div>
                        )}

                        {importStatus === 'completed' && (
                            <div className="import-result-container" style={{ padding: '10px 0' }}>
                                {importResult?.success ? (
                                    <>
                                        <div style={{
                                            background: 'rgba(0, 255, 0, 0.1)', color: '#4caf50',
                                            padding: '12px', borderRadius: '8px', marginBottom: '16px',
                                            textAlign: 'center'
                                        }}>
                                            Import successfully completed!
                                        </div>
                                        <div className="result-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            {Object.entries(importResult.counts || {}).map(([key, count]) => (
                                                <div key={key} style={{
                                                    background: 'var(--card-bg)', padding: '8px 12px',
                                                    borderRadius: '6px', border: '1px solid var(--border)',
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                }}>
                                                    <span style={{ textTransform: 'capitalize' }}>{key}</span>
                                                    <span style={{ fontWeight: 'bold' }}>{count as number}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <button className="action-btn" style={{ width: '100%', marginTop: '20px' }} onClick={() => {
                                            window.location.reload();
                                        }}>
                                            Reload Application
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div style={{
                                            background: 'rgba(255, 0, 0, 0.1)', color: '#f44336',
                                            padding: '12px', borderRadius: '8px', marginBottom: '16px',
                                            textAlign: 'center'
                                        }}>
                                            Error: {importResult?.error || 'Unknown error occurred'}
                                        </div>
                                        <button className="action-btn secondary" style={{ width: '100%', marginTop: '10px' }} onClick={() => {
                                            setImportStatus('idle');
                                            setImportResult(null);
                                        }}>
                                            Try Again
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Settings;
