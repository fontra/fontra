import subprocess

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class JSDepsBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        super().initialize(version, build_data)
        subprocess.check_output("npm install", shell=True)
        subprocess.check_output("python -I scripts/jsdeps.py", shell=True)
