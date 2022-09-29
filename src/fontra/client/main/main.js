const windowStateKeeper = require('electron-window-state')
const getMenubarTemplate = require('./menubar')
const ChildProcess = require('child_process')

const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')

const [, , projectPath] = process.argv;

const apiPids = [];

function createWindow () {
  try {
    global.portNumber = 8000;
    global.apiUrl = `http://127.0.0.1:8000`;

    const python = ChildProcess.spawn(
      'fontra',
      ['--http-port',
       global.portNumber,
       'filesystem',
       projectPath
      ], {
        env: {...process.env}
      }
    );
    python.stdout.on("data", data => {
      console.log("data: ", data.toString("utf8"));
    });
    python.stderr.on("data", data => {
      console.log(`stderr: ${data}`);
    });
    apiPids.push(python.pid);
  } catch (e) {
    console.log(e);
  }

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

    win.loadFile('src/fontra/client/renderer/landing.html')

    mainWindowState.manage(win)
    Menu.setApplicationMenu(Menu.buildFromTemplate(getMenubarTemplate(win)))
  // addWindowListeners(win);
  
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
