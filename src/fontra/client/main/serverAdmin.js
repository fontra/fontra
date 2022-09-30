const path = require('path');
const fse = require('fs-extra');
const ChildProcess = require('child_process');
const { platform } = require('os');

function venvBinDir() {
  return process.platform == 'win32' ? 'Scripts' : 'bin';
}

function makeActivatedVenv(fontraDir) {
  const venvDir = path.join(fontraDir, 'venv');
  const envs = {
    ...process.env,
    VIRTUAL_ENV: venvDir,
    PATH: `${venvDir}/${venvBinDir()}:${process.env.PATH}`
  }
  delete envs.PYTHONHOME;
  return envs
}

function installServer(fontraDir) {
    console.log('Installing server...')
    const env = makeActivatedVenv(fontraDir);
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

    fse.mkdirSync(fontraDir)
    const whl = path.join(process.resourcesPath, 'extraResources','fontra-0.0.0-py3-none-any.whl');
    console.log(whl)

    const output = ChildProcess.execSync(
      'python -m venv venv',
      {
        cwd: fontraDir
      }
    );

    console.log(env);
    const output2 = ChildProcess.execSync(
      `${path.join(env.VIRTUAL_ENV, venvBinDir(), 'pip')} install ${whl}`,
      {
        cwd: fontraDir,
        env,
        shell: true
      }
    );
   }


   function runServer(fontraDir, absoluteProjectPath, apiPids) {
    const env = makeActivatedVenv(fontraDir);
    console.log('running server', fontraDir)
    //try {
      global.portNumber = 8000;
      global.apiUrl = `http://127.0.0.1:8000`;
  
      const python = ChildProcess.spawn(
        'fontra',
        ['--http-port', global.portNumber, 'filesystem', absoluteProjectPath], {
          env,
          cwd: fontraDir,
          shell: true
        }
      );
      python.stdout.on("data", data => {
        console.log("data: ", data.toString("utf8"));
      });
      python.stderr.on("data", data => {
        console.log(`stderr: ${data}`);
      });
      apiPids.push(python.pid);
   // } catch (e) {
    //  console.log(e);
   // }
  }

   module.exports = {installServer, runServer}