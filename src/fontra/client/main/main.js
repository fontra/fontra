const windowStateKeeper = require('electron-window-state')
const getMenubarTemplate = require('./menubar')
const ChildProcess = require('child_process')
const fse = require('fs-extra');
const path = require('path');
const firstRun = require('electron-first-run');
 
const isFirstRun = firstRun()

const { app, BrowserWindow, Menu } = require('electron')
// const path = require('path')

const [, , projectPath] = process.argv;

const absoluteProjectPath = path.resolve('.', projectPath);
console.log(absoluteProjectPath)

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

  win.loadFile('src/fontra/client/renderer/firstRun.html')
  mainWindowState.manage(win)
  Menu.setApplicationMenu(Menu.buildFromTemplate(getMenubarTemplate(win)))
  console.log('asdiao')

  const appDir = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
  const fontraDir = path.resolve(appDir, './fontra');


  function runServer() {
    console.log('running server')
    try {
      global.portNumber = 8000;
      global.apiUrl = `http://127.0.0.1:8000`;
  
      const python = ChildProcess.spawn(
        'cmd',
        ['/K', './src/scripts/run-server-win.bat', global.portNumber, absoluteProjectPath], {
          env: {...process.env},
          cwd: fontraDir
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
  
    win.loadFile('src/fontra/client/renderer/landing.html')
  }

  win.webContents.once("did-finish-load", () => {
    console.log('yayayay')
    //if (isFirstRun) {
    //try {
   
    const pythonVersion = ChildProcess.execSync(
      'python -V',
    );
    const [majorVersion, minorVersion] = pythonVersion.toString().split('.');
    if (majorVersion !== 'Python 3' || parseInt(minorVersion, 10) < 10) {
      throw new Error('Python must be in your path and v3.10 or above')
    }

    if (fse.pathExistsSync(fontraDir)) {
      fse.removeSync(fontraDir);
    }

    // TODO: This can be tidied up using copySync's filter function
    fse.mkdirSync(fontraDir)
    fse.copySync('./.git', path.resolve(fontraDir, './.git'))
    fse.copySync('./src', path.resolve(fontraDir, './src'))
    fse.copySync('./fontra-icon.svg', path.resolve(fontraDir, './fontra-icon.svg'))
    fse.copySync('./pyproject.toml', path.resolve(fontraDir, './pyproject.toml'))
    fse.copySync('./requirements.txt', path.resolve(fontraDir, './requirements.txt'))
    fse.copySync('./setup.py', path.resolve(fontraDir, './setup.py'))

    console.log('installed')
    const output = ChildProcess.execSync(
      'python -m venv venv',
      {
        cwd: fontraDir
      }
    );

    const output2 = ChildProcess.execSync(
      'call ./src/scripts/install_server_win.bat',
      {
        cwd: fontraDir
      }
    );

    console.log('yay')
    console.log(output.toString())
    //} catch(e) {
    //  throw new Error("problems with first run")
    //  firstRun.clear()
    //}
  //}
      runServer()
  })


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
