const pkg = require('./package.json');

const isNightly = pkg.version.includes('nightly');

/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
const config = {
    appId: "com.mangyomi.app",
    productName: "Mangyomi",
    publish: {
        provider: "github",
        owner: "Mangyomi",
        repo: "mangyomi-app"
    },
    buildDependenciesFromSource: false,
    nodeGypRebuild: false,
    npmRebuild: true, // Required for better-sqlite3 native module
    directories: {
        output: "release"
    },
    files: [
        "dist/**/*",
        "dist-electron/**/*",
        "extensions/**/*",
        "!**/node_modules/**/*.{md,ts,map,txt}",
        "!**/node_modules/**/{test,tests,__tests__,docs,example,examples}/**",
        "!**/node_modules/.cache/**",
        "!**/node_modules/react/**",
        "!**/node_modules/react-dom/**",
        "!**/node_modules/react-router/**",
        "!**/node_modules/react-router-dom/**",
        "!**/node_modules/@csstools/**",
        "!**/node_modules/cssstyle/**",
        "!**/node_modules/typescript/**",
        "!**/node_modules/vite/**",
        "!**/node_modules/esbuild/**",
        "!**/node_modules/rollup/**",
        "!**/node_modules/@types/**",
        "!**/node_modules/@vitejs/**"
    ],
    asar: true,
    asarUnpack: [
        "**/*.node"
    ],
    extraResources: [],
    win: {
        target: ["nsis", "dir"],
        icon: isNightly ? "build/icon-nightly.ico" : "build/icon.ico",
        executableName: "Mangyomi",
        fileAssociations: [
            {
                ext: "mgb",
                name: "Mangyomi Backup",
                description: "Mangyomi Backup File",
                role: "Editor"
            }
        ]
    },
    nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: "Mangyomi",
        perMachine: false,
        runAfterFinish: true,
        include: "build/installer.nsh"
    },
    mac: {
        target: "dmg"
    },
    linux: {
        target: ["AppImage"],
        icon: "build/icon.png",
        category: "Graphics",
        fileAssociations: [
            {
                ext: "mgb",
                name: "Mangyomi Backup",
                description: "Mangyomi Backup File",
                mimeType: "application/x-mangyomi-backup"
            }
        ]
    }
};

module.exports = config;
