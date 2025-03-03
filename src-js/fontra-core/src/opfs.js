import { assert, withTimeout } from "./utils.js";

export async function getOPFS() {
  return new FileSystem(
    () => navigator.storage.getDirectory(),
    writeFileToOPFSInWorker
  );
}

export class FileSystem {
  constructor(getRootDirectoryFunc, writeFileInWorker) {
    this._getRootDirectoryFunc = getRootDirectoryFunc;
    this._writeFileInWorker = writeFileInWorker;
    this._fsSupportsCreateWritable = undefined;
  }

  async exists(path) {
    return await this._exists(path, true, true);
  }

  async isFile(path) {
    return await this._exists(path, true, false);
  }

  async isDirectory(path) {
    return await this._exists(path, false, true);
  }

  async *iterDirectory(path) {
    const dirHandle = await this._getDirectoryHandle(path);
    for await (const name of dirHandle.keys()) {
      yield name;
    }
  }

  async *iterDirectoryPaths(path) {
    const dirHandle = await this._getDirectoryHandle(path);
    for await (const name of dirHandle.keys()) {
      yield path.concat([name]);
    }
  }

  async createDirectory(path, createParents = false) {
    assert(path.length);
    if (createParents) {
      this._getDirectoryHandle(path, true);
    } else {
      const { dirHandle, name } = await this._getParentDirectoryHandle(path);
      await dirHandle.getDirectoryHandle(name, { create: true });
    }
  }

  async deleteDirectory(path, recursive = false) {
    const { dirHandle, name } = await this._getParentDirectoryHandle(path);
    await dirHandle.removeEntry(name, { recursive });
  }

  async readFile(path) {
    const { dirHandle, name } = await this._getParentDirectoryHandle(path);
    const fileHandle = await dirHandle.getFileHandle(name);
    return await fileHandle.getFile();
  }

  async writeFile(path, file) {
    if (
      this._fsSupportsCreateWritable == undefined ||
      this._fsSupportsCreateWritable === true
    ) {
      const error = await this._writeFile(path, file);
      if (this._fsSupportsCreateWritable == undefined) {
        this._fsSupportsCreateWritable = !error;
      }
    }
    if (this._fsSupportsCreateWritable === false) {
      await this._writeFileInWorker(path, file);
    }
  }

  async deleteFile(path) {
    const { dirHandle, name } = await this._getParentDirectoryHandle(path);
    await dirHandle.removeEntry(name);
  }

  async _getRootDirectory() {
    return await this._getRootDirectoryFunc();
  }

  async _exists(path, fileExists = false, dirExists = false) {
    const { dirHandle, name } = await this._getParentDirectoryHandle(path);
    return (
      (fileExists && (await isDir(dirHandle, name))) ||
      (dirExists && (await isFile(dirHandle, name)))
    );
  }

  async _getDirectoryHandle(path, create = false) {
    let dirHandle = await this._getRootDirectory();
    for (const dirName of path) {
      dirHandle = await dirHandle.getDirectoryHandle(dirName, { create });
    }
    return dirHandle;
  }

  async _getParentDirectoryHandle(path, create = false) {
    assert(path.length);
    const dirPath = path.slice(0, -1);
    const name = path.at(-1);
    const dirHandle = await this._getDirectoryHandle(dirPath, create);
    return { dirHandle, name };
  }

  async _writeFile(path, file) {
    const { dirHandle, name } = await this._getParentDirectoryHandle(path);
    const fileHandle = await dirHandle.getFileHandle(name, { create: true });
    if (!fileHandle.createWritable) {
      // This is the case in Safari (as of august 2023)
      return "file system does not support fileHandle.createWritable()";
    }
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
  }
}

async function isDir(dirHandle, name) {
  try {
    const handle = await dirHandle.getDirectoryHandle(name);
  } catch (e) {
    return false;
  }
  return true;
}

async function isFile(dirHandle, name) {
  try {
    const handle = await dirHandle.getFileHandle(name);
  } catch (e) {
    return false;
  }
  return true;
}

// Safari only supports the async file write API in Web Workers, so we do that
// when needed. See opfs-write-worker.js for more comments.

let worker;

function getWriteWorker() {
  if (!worker) {
    const path = "/core/opfs-write-worker.js"; // + `?${Math.random()}`;
    worker = new Worker(path);
  }
  return worker;
}

async function writeFileToOPFSInWorker(path, file) {
  return await withTimeout(
    new Promise((resolve, reject) => {
      const worker = getWriteWorker();
      worker.onmessage = (event) => {
        if (event.data.error) {
          reject(event.data.error);
        } else {
          resolve(event.data.returnValue);
        }
      };
      worker.postMessage({ path, file });
    }),
    5000
  );
}
