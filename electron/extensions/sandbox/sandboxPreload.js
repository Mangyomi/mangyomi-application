const { ipcRenderer, contextBridge } = require('electron');

// Expose requestCloudflareSession to the sandbox
contextBridge.exposeInMainWorld('cloudflareHelper', {
    requestSession: (url) => ipcRenderer.invoke('sandbox:requestCloudflareSession', url)
});
