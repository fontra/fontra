import json
import shutil
from pathlib import Path

repoRoot = Path(__file__).resolve().parent.parent
nodeModulesDir = repoRoot / "node_modules"
destDir = repoRoot / "src/fontra/client/third-party/"


def loadPackageDependencies():
    with open("package.json") as packageFile:
        packageInfo = json.load(packageFile)
        dependencies = packageInfo.get("dependencies", {})
        return list(dependencies.keys())
    return []


def processDependencies(dependencies):
    if destDir.is_dir():
        shutil.rmtree(destDir)
    for dependency in dependencies:
        processDependency(name=dependency)


def processDependency(name):
    src = nodeModulesDir / name
    dest = destDir / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dest)
    print(f"[{name}] {str(src)!r} -> {str(dest)!r}")


def main():
    dependencies = loadPackageDependencies()
    processDependencies(dependencies=dependencies)


if __name__ == "__main__":
    main()
