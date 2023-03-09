import subprocess

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class JSDepsBuildHook(BuildHookInterface):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        subprocess.check_output("python -I scripts/jsdeps.py", shell=True)
