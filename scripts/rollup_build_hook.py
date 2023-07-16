import pathlib
import subprocess

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class RollupBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        subprocess.check_output("npm install", shell=True)
        subprocess.check_output("npm run bundle-rollup", shell=True)

        rootDir = pathlib.Path().resolve()
        thirdPartyPath = rootDir / "src" / "fontra" / "client" / "third-party"
        for path in thirdPartyPath.iterdir():
            relPath = "/" + "/".join(path.relative_to(rootDir).parts)
            build_data["artifacts"].append(relPath)
