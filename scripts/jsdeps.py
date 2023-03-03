import json
import shutil
from functools import lru_cache
from pathlib import Path

import yaml


@lru_cache(maxsize=None)
def load_config():
    with open("scripts/jsdeps.yml") as config_file:
        config = yaml.load(config_file, Loader=yaml.Loader)
        return config
    return None


@lru_cache(maxsize=None)
def load_package_dependencies():
    with open("package.json") as package_file:
        package_info = json.load(package_file)
        dependencies = package_info.get("dependencies")
        if dependencies:
            return list(dependencies.keys())
    return []


def process_dependencies():
    config = load_config()
    shutil.rmtree(config["dest_base_dir"])
    for dependency in config["mappings"]:
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

    config = load_config()
    dest_base_dir = config["dest_base_dir"]
    dest = file.get("dest", src.name).lstrip("/")
    dest = Path(dest_base_dir) / name / dest
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
