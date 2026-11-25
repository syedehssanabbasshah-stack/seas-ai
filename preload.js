/* ══════════════════════════════════════════════
   Seas AI — preload bridge
   The renderer keeps zero Node access; it only
   gets the window controls it needs.
   ══════════════════════════════════════════════ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('seasDesktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  /* Desktop control: one named tool per call, never a shell string. */
  pc: {
    run: (tool, args) => ipcRenderer.invoke('pc:tool', { tool, args }),
  },
  win: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    onMaximized: (callback) => {
      const handler = (_event, value) => callback(Boolean(value));
      ipcRenderer.on('window:maximized', handler);
      return () => ipcRenderer.removeListener('window:maximized', handler);
    },
  },
});
