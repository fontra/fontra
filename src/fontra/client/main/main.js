const windowStateKeeper = require('electron-window-state')
const getMenubarTemplate = require('./menubar')
const {installServer, runServer, restartServer} = require('./serverAdmin')
const path = require('path');

// change to does venv exist? does fontra exist? install wheel if not (maybe also check version)

const { app, BrowserWindow, Menu } = require('electron');

const [, , projectPath] = process.argv;

const absoluteProjectPath = path.resolve('.', projectPath || '.');
const appDir = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");

global.fontraDir = path.resolve(appDir, './fontraServer');
global.apiPids = [];

// fix shell environment variables for macs
(async function getEnvVariables() {
  const {shellEnvSync} = await import('shell-env');
  const envVariables = shellEnvSync();
  console.log(envVariables.PATH);
  global.shellPath = envVariables.PATH;
})();

async function createWindow () {
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

  win.loadFile('src/fontra/client/renderer/firstRun.html')
  win.webContents.once("did-finish-load", async () => {
      installServer()
      await runServer(absoluteProjectPath)  
      win.loadFile('src/fontra/client/renderer/landing.html')
  })

  
  mainWindowState.manage(win)
  Menu.setApplicationMenu(Menu.buildFromTemplate(getMenubarTemplate(win, restartServer)))

  
  win.on("close", () => {
    // App close handler
    global.apiPids.forEach((pid) => {
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
  } else {
    app.quit()
  }
})
