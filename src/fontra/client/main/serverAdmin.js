const path = require('path');
const fse = require('fs-extra');
const fp = require("find-free-port");
const ChildProcess = require('child_process');

function venvBinDir() {
  return process.platform == 'win32' ? 'Scripts' : 'bin';
}

function pythonCommand() {
  return process.platform == 'darwin' ? 'python3' : 'python';
}

function makeActivatedVenv() {
  const venvDir = path.join(global.fontraDir, 'venv');
  const envs = {
    ...process.env,
    VIRTUAL_ENV: venvDir,
    PATH: `${venvDir}/${venvBinDir()}:${global.shellPath}`
  }
  console.log(envs);
  delete envs.PYTHONHOME;
  return envs
}

async function restartServer(win, newPath) {
  global.apiPids.forEach((pid) => {
    process.kill(pid);
  });

  global.apiPids = [];

  await runServer(newPath);
  win.loadFile('src/fontra/client/renderer/landing.html')
}

function installServer() {
    console.log('Installing server...')
    const env = makeActivatedVenv();
    const opts = process.platform === 'darwin' ? {
      env,
      shell: true
    } : {};
    const pythonVersion = ChildProcess.execSync(
      `${pythonCommand()} -V`,
      opts
    );
    const [majorVersion, minorVersion] = pythonVersion.toString().split('.');
    if (majorVersion !== 'Python 3' || parseInt(minorVersion, 10) < 10) {
      throw new Error('Python must be in your path and v3.10 or above')
    }

    if (!fse.pathExistsSync(global.fontraDir)) {
      fse.mkdirSync(global.fontraDir);
    }

    const whl = path.join(process.resourcesPath, 'extraResources','fontra-0.0.0-py3-none-any.whl');

    if (!fse.pathExistsSync(env.VIRTUAL_ENV)) {
      ChildProcess.execSync(
        `${pythonCommand()} -m venv venv`,
        {
          cwd: global.fontraDir
        }
      );
    }

    const output2 = ChildProcess.execSync(
      `${path.join(env.VIRTUAL_ENV, venvBinDir(), 'pip')} install ${whl}`,
      {
        cwd: global.fontraDir,
        env,
      }
    );
   }


   async function runServer(absoluteProjectPath) {
    const env = makeActivatedVenv();
    console.log('running server...');
    //try {
      const portNumber = await fp(8000)
  
      const python = ChildProcess.spawn(
        `${path.join(env.VIRTUAL_ENV, venvBinDir(), 'fontra')}`,
        ['--http-port', portNumber, 'filesystem', absoluteProjectPath], {
          env,
          cwd: global.fontraDir,
        }
      );
      python.stdout.on("data", data => {
        console.log("data: ", data.toString("utf8"));
      });
      python.stderr.on("data", data => {
        console.log(`stderr: ${data}`);
      });
      global.apiPids.push(python.pid);
   // } catch (e) {
    //  console.log(e);
   // }
  }

  module.exports = {installServer, runServer, restartServer}