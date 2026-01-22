/**
 * IPC Handlers Index
 * 
 * This module exports setup functions for all IPC handler categories.
 * Import and call these from main.ts setupIpcHandlers() function.
 */

export { setupDatabaseHandlers } from './database';
export { setupExtensionHandlers } from './extensions';
export { setupCacheHandlers } from './cache';
export { setupAnilistHandlers } from './anilist';
export { setupSettingsHandlers } from './settings';
export { setupAppHandlers } from './app';
export { setupDiscordHandlers } from './discord';
export { setupNetworkHandlers } from './network';
export { registerExportHandlers } from './export';

