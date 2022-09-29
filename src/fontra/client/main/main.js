const windowStateKeeper = require('electron-window-state');

const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')

function createWindow () {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 800
  });
  
  // Create the browser window.
    const win = new BrowserWindow({
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      height: mainWindowState.height,
      minWidth: 512,
      minHeight: 512,
      // webPreferences: {
      //   // Use pluginOptions.nodeIntegration, leave this alone
      //   // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      //   nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
      //   contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION,
      //   enableRemoteModule: true,
      //   preload: path.join(__dirname, 'preload.js')
      // }
    });

    win.loadFile('src/fontra/client/renderer/landing.html')

    mainWindowState.manage(win);
    Menu.setApplicationMenu(Menu.buildFromTemplate(getMenubarTemplate(win)));
  // addWindowListeners(win);
  
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
