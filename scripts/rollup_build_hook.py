import subprocess

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class RollupBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        subprocess.check_output("npm install", shell=True)
        subprocess.check_output("npm run bundle-rollup", shell=True)
        build_data["artifacts"].append("/src/fontra/client/third-party/")
