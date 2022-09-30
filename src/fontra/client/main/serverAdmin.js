const path = require('path');
const fse = require('fs-extra');
const ChildProcess = require('child_process');

function makeActivatedVenv(fontraDir) {
  const venvDir = path.resolve(fontraDir, '/venv');
  const envs = {
    ...process.env,
    VIRTUAL_ENV: venvDir,
    PATH: `${venvDir}/Scripts:${process.env.PATH}`
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

    // TODO: This can be tidied up using copySync's filter function
    fse.mkdirSync(fontraDir)
    fse.copyFileSync('./dist/fontra-0.0.0-py3-none-any.whl', path.resolve(fontraDir, 'fontra-0.0.0-py3-none-any.whl'))

    const output = ChildProcess.execSync(
      'python -m venv venv',
      {
        cwd: fontraDir
      }
    );

    const output2 = ChildProcess.execSync(
      'pip install fontra-0.0.0-py3-none-any.whl',
      {
        cwd: fontraDir,
        env
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
   // } catch (e) {
    //  console.log(e);
   // }
  }

   module.exports = {installServer, runServer}