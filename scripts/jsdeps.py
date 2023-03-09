import json
import shutil
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class JSDepsBuildHook(BuildHookInterface):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        main()


DEST_BASE_DIR = "src/fontra/client/third-party/"


def load_package_dependencies():
    with open("package.json") as package_file:
        package_info = json.load(package_file)
        dependencies = package_info.get("dependencies")
        if dependencies:
            return list(dependencies.keys())
    return []


def process_dependencies(dependencies):
    if Path(DEST_BASE_DIR).is_dir():
        shutil.rmtree(DEST_BASE_DIR)
    for dependency in dependencies:
        process_dependency(name=dependency)


def process_dependency(name):
    src = Path("node_modules") / name
    dest = Path(DEST_BASE_DIR) / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dest)
    print(f"[{name}] {str(src)!r} -> {str(dest)!r}")


def main():
    dependencies = load_package_dependencies()
    process_dependencies(dependencies=dependencies)


if __name__ == "__main__":
    main()
