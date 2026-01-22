import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import path from 'path'
import pkg from './package.json'

export default defineConfig({
    define: {
        APP_VERSION: JSON.stringify(pkg.version),
    },
    plugins: [
        react(),
        electron([
            {
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        emptyOutDir: false, // Clean handled by build script to avoid preload race condition
                        rollupOptions: {
                            external: ['jsdom', 'better-sqlite3', 'bufferutil', 'utf-8-validate']
                        }
                    }
                }
            },
            {
                entry: 'electron/preload.ts',
                onstart(options) {
                    options.reload()
                },
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        emptyOutDir: false,
                        rollupOptions: {
                            external: ['bufferutil', 'utf-8-validate']
                        }
                    }
                }
            }
        ])
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    build: {
        outDir: 'dist'
    }
})
