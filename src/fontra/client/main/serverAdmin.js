const path = require('path');
const fse = require('fs-extra');
const ChildProcess = require('child_process');

function installServer(fontraDir) {
    console.log('Installing server...')
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
   }


   function runServer(fontraDir, absoluteProjectPath, apiPids) {
    console.log('running server')
    try {
      global.portNumber = 8000;
      global.apiUrl = `http://127.0.0.1:8000`;
  
      const python = ChildProcess.spawn(
        'call',
        ['./src/scripts/run-server-win.bat', global.portNumber, absoluteProjectPath], {
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

   module.exports = {installServer, runServer}