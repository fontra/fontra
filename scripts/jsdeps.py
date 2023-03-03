import json
import shutil
from functools import lru_cache
from pathlib import Path

# TODO: move these settings to external config file
DEPENDENCIES_DEST_BASE_DIR = "src/fontra/client/third-party/"
DEPENDENCIES_MAPPINGS = [
    {
        "name": "bezier-js",  # node module name
        "files": [  # list of files to copy: src -> dest
            {
                # path relative to the "node_modules/{node_module_name}/"
                "src": "src/bezier.js",
                # path relative to "{DEPENDENCIES_DEST_BASE_DIR}/{node_module_name}/"
                "dest": "bezier.js",
            },
            {
                "src": "src/poly-bezier.js",
                "dest": "poly-bezier.js",
            },
            {
                "src": "src/utils.js",
                "dest": "utils.js",
            },
        ],
    },
]


@lru_cache(maxsize=None)
def load_package_dependencies():
    with open("package.json") as package_file:
        package_info = json.load(package_file)
        dependencies = package_info.get("dependencies")
        if dependencies:
            return list(dependencies.keys())
    return []


def process_dependencies():
    shutil.rmtree(DEPENDENCIES_DEST_BASE_DIR)
    for dependency in DEPENDENCIES_MAPPINGS:
        process_dependency(dependency)


def process_dependency(dependency):
    package_dependencies = load_package_dependencies()
    name = dependency["name"]
    assert (
        name in package_dependencies
    ), f"Invalid module: {name!r} not listed in package.json dependecies."

    files = dependency["files"]
    for file in files:
        process_dependency_file(name, file)


def process_dependency_file(name, file):
    src = file["src"]
    src = Path("node_modules") / name / src
    assert (
        src.is_file()
    ), f"Invalid source path: {src!r} file not found, ensure that the path is correct."

    dest = file.get("dest", src.name).lstrip("/")
    dest = Path(DEPENDENCIES_DEST_BASE_DIR) / name / dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    assert (
        not dest.is_dir()
    ), f"Invalid destination path: {dest!r} is an existing directory."

    shutil.copyfile(src, dest)
    print(f"[{name}] {str(src)!r} -> {str(dest)!r}")


def main():
    process_dependencies()


if __name__ == "__main__":
    main()
