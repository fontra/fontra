#!/usr/bin/env python

import argparse
import pathlib
import textwrap

from fontTools.unicodedata.Blocks import RANGES as BLOCKS_RANGES
from fontTools.unicodedata.Blocks import VALUES as BLOCKS_VALUES
from fontTools.unicodedata.ScriptExtensions import RANGES as SCRIPT_EXTENSIONS_RANGES
from fontTools.unicodedata.ScriptExtensions import VALUES as SCRIPT_EXTENSIONS_VALUES
from fontTools.unicodedata.Scripts import NAMES as SCRIPT_NAMES
from fontTools.unicodedata.Scripts import RANGES as SCRIPT_RANGES
from fontTools.unicodedata.Scripts import VALUES as SCRIPT_VALUES


def formatArray(varName, items, openBracket="[", closeBracket="]", export=False):
    content = ", ".join(items) + ","
    content = textwrap.indent("\n".join(textwrap.wrap(content, width=86)), "  ")
    exportString = "export " if export else ""
    return (
        "// prettier-ignore\n"
        + f"{exportString}const {varName} = {openBracket}\n"
        + f"{content}\n{closeBracket};\n\n"
    )


_scriptRangesItems = (f"0x{x:x}" for x in SCRIPT_RANGES)
scriptRangesString = formatArray("SCRIPT_RANGES", _scriptRangesItems)

_scriptValuesItems = (f'"{x}"' for x in SCRIPT_VALUES)
scriptValuesString = formatArray("SCRIPT_VALUES", _scriptValuesItems)

_scriptExtensionRangesItems = (f"0x{x:x}" for x in SCRIPT_EXTENSIONS_RANGES)
scriptExtensionRangesString = formatArray(
    "SCRIPT_EXTENSIONS_RANGES", _scriptExtensionRangesItems
)

_scriptExtensionValuesItems = (
    (
        ("[" + ", ".join([f'"{value}"' for value in sorted(values)]) + "]")
        if values
        else "null"
    )
    for values in SCRIPT_EXTENSIONS_VALUES
)
scriptExtensionValuesString = formatArray(
    "SCRIPT_EXTENSIONS_VALUES", _scriptExtensionValuesItems
)

_scriptNamesItems = (f'{k}: "{v}"' for k, v in SCRIPT_NAMES.items())
scriptNamesString = formatArray("scriptNames", _scriptNamesItems, "{", "}", True)

_blocksRangesItems = (f"0x{x:x}" for x in BLOCKS_RANGES)
blocksRangesString = formatArray("BLOCKS_RANGES", _blocksRangesItems)

# Replace space and hyphen with markers and back to work around our dumb line wrap approach
_blocksValuesItems = (
    f'"{x.replace(" ", "+").replace("-", "|")}"' for x in BLOCKS_VALUES
)
blocksValuesString = (
    formatArray("BLOCKS_VALUES", _blocksValuesItems).replace("|", "-").replace("+", " ")
)


startMarker = "// Begin auto-generated code\n\n"
endMarker = "// End auto-generated code\n"


def insertScriptsIntoModule(check=False):
    repoDir = pathlib.Path(__file__).resolve().parent.parent
    unicodeScriptsPath = (
        repoDir / "src-js" / "fontra-core" / "src" / "unicode-scripts-blocks.js"
    )

    sourceText = unicodeScriptsPath.read_text(encoding="utf-8")

    start = sourceText.find(startMarker)
    assert start > 0
    start += len(startMarker)

    end = sourceText.find(endMarker, start)
    assert end > start

    newSourceText = (
        sourceText[:start]
        + scriptRangesString
        + scriptValuesString
        + scriptExtensionRangesString
        + scriptExtensionValuesString
        + scriptNamesString
        + blocksRangesString
        + blocksValuesString
        + sourceText[end:]
    )

    if check:
        if sourceText != newSourceText:
            (
                unicodeScriptsPath.parent / (unicodeScriptsPath.stem + ".text.txt")
            ).write_text(newSourceText, encoding="utf-8")
            raise ValueError("new source differs from old source")
        print("all good")
    else:
        unicodeScriptsPath.write_text(newSourceText, encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", default=False)
    args = parser.parse_args()

    insertScriptsIntoModule(check=args.check)
