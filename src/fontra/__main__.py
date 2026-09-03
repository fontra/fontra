import argparse
import asyncio
import logging
import os
import pathlib
import secrets
import subprocess
from importlib.metadata import entry_points

from . import __version__ as fontraVersion
from .backends.populate import createNewFontAndPopulate
from .core.protocols import ProjectManager, ProjectManagerFactory
from .core.server import FontraServer, findFreeTCPPort

DEFAULT_PORT = 8000


def addNewSubCommand(subParsers):
    subParser = subParsers.add_parser("new", description="Create a new font project")
    subParser.add_argument(
        "-f",
        "--force-overwrite",
        action="store_true",
        default=False,
        help="Overwrite existing file or folder",
    )
    subParser.add_argument(
        "path",
        help="Path for the new font. Supported file types: .designspace, .ufo, .fontra",
    )
    subParser.set_defaults(action=newFont)


def newFont(args, parser: argparse.ArgumentParser) -> None:
    if not os.path.exists(args.path) or args.force_overwrite:
        asyncio.run(createNewFontAndPopulate(args.path))
    else:
        parser.error(
            message="File already exits; use -f or --force-overwrite to force overwrite."
        )


def runServer(args, parser: argparse.ArgumentParser) -> None:
    host = args.host
    httpPort = args.http_port
    manager: ProjectManager = args.getProjectManager(args)

    bundleWatchProcess = (
        subprocess.Popen(["npm", "run", "bundle-watch"]) if args.dev else None
    )

    server = FontraServer(
        host=host,
        httpPort=(
            httpPort
            if httpPort is not None
            else findFreeTCPPort(DEFAULT_PORT, host=host)
        ),
        projectManager=manager,
        launchWebBrowser=args.launch,
        versionToken=secrets.token_hex(4),
        contentRoot=args.content_root,
    )
    server.setup()
    server.run()

    if bundleWatchProcess is not None:
        bundleWatchProcess.terminate()
        bundleWatchProcess.wait()


def main() -> None:
    logging.basicConfig(
        format="%(asctime)s %(name)-17s %(levelname)-8s %(message)s",
        level=logging.INFO,
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--dev", action="store_true", help="Enable development mode")
    parser.add_argument(
        "--http-port",
        type=int,
        help="The HTTP port to listen to. If this argument is *not* passed, "
        f"Fontra will search for a free port, starting at {DEFAULT_PORT}",
    )
    parser.add_argument(
        "--launch", action="store_true", help="Launch the default browser"
    )
    parser.add_argument("--content-root", type=pathlib.Path)
    parser.add_argument(
        "-V",
        "--version",
        action="version",
        version=fontraVersion,
        help="Show Fontra's version number and exit",
    )

    subParsers = parser.add_subparsers(required=True)

    addNewSubCommand(subParsers)

    for entryPoint in entry_points(group="fontra.projectmanagers"):
        if entryPoint.name in subParsers.choices:
            # Avoid adding a sub-parser multiple times
            # See https://github.com/fontra/fontra/issues/141
            continue
        subParser = subParsers.add_parser(entryPoint.name)
        pmFactory: ProjectManagerFactory = entryPoint.load()
        pmFactory.addArguments(subParser)
        subParser.set_defaults(
            action=runServer, getProjectManager=pmFactory.getProjectManager
        )

    args = parser.parse_args()
    args.action(args, parser)


if __name__ == "__main__":
    main()
