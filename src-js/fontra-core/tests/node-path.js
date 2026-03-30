import fs from "fs";
import { glob, readFile } from "fs/promises";
import { basename, dirname, extname, join } from "path";

export class NodePath {
  constructor(path) {
    this._path = path;
  }

  joinPath(...pathsegments) {
    return new NodePath(join(this._path, ...pathsegments));
  }

  get parent() {
    return new NodePath(dirname(this._path));
  }

  get name() {
    return basename(this._path);
  }

  get suffix() {
    return extname(this._path);
  }

  get stem() {
    return basename(this._path).slice(0, -this.suffix.length);
  }

  async readText() {
    return await readFile(this._path, { encoding: "utf-8" });
  }

  async readBytes() {
    return await readFile(this._path);
  }

  async *glob(pattern) {
    for await (const name of glob(pattern, { cwd: this._path })) {
      yield this.joinPath(name);
    }
  }

  exists() {
    return fs.existsSync(this._path);
  }
}
