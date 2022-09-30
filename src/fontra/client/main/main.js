const windowStateKeeper = require('electron-window-state')
const getMenubarTemplate = require('./menubar')
const {installServer, runServer} = require('./serverAdmin')
const path = require('path');
const firstRun = require('electron-first-run');
 
const isFirstRun = firstRun()

const { app, BrowserWindow, Menu } = require('electron');
console.log(process.env)

const [, , projectPath] = process.argv;

const absoluteProjectPath = path.resolve('.', projectPath);
const appDir = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
const fontraDir = path.resolve(appDir, './fontra');

const apiPids = [];

function createWindow () {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 800
  })
  
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
  })

  if (isFirstRun) {
    win.loadFile('src/fontra/client/renderer/firstRun.html')
    win.webContents.once("did-finish-load", () => {
        installServer(fontraDir)
        runServer(fontraDir, absoluteProjectPath, apiPids)  
        win.loadFile('src/fontra/client/renderer/landing.html')
    })
  
  
    // addWindowListeners(win);  
  } else {
    win.loadFile('src/fontra/client/renderer/welcome.html')
    runServer(fontraDir, absoluteProjectPath, apiPids)
    win.loadFile('src/fontra/client/renderer/landing.html')
  }
  
  mainWindowState.manage(win)
  Menu.setApplicationMenu(Menu.buildFromTemplate(getMenubarTemplate(win)))

  
  win.on("close", () => {
    // App close handler
    apiPids.forEach((pid) => {
      process.kill(pid);
    });
  });
  
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
