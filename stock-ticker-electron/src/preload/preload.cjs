const { contextBridge, ipcRenderer } = require('electron');

// 页面只能调用浮窗自身的行情和窗口操作。
contextBridge.exposeInMainWorld('ticker', {
  quote: (force) => ipcRenderer.invoke('ticker:quote', force),
  details: (open) => ipcRenderer.invoke('ticker:details', open),
  drag: (phase) => ipcRenderer.send('ticker:drag', phase),
  close: () => ipcRenderer.send('ticker:close'),
});
