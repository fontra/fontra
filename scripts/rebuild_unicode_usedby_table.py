#!/usr/bin/env python

import argparse
import pathlib
from collections import defaultdict

import unicodedata2


def makeUsedByTable():
    table = defaultdict(set)
    for _codePoint in range(32, 0x10FFFF):
        c = chr(_codePoint)
        decomposed = unicodedata2.normalize("NFKD", c)
        if decomposed == c:
            continue
        if decomposed != " ":
            decomposed = decomposed.replace(" ", "")
        for d in decomposed:
            table[d].add(c)
    return {k: sorted(v) for k, v in table.items()}


def formatUsedByTable(table):
    lines = []
    for k, v in sorted(table.items()):
        row = [k] + v
        if k == " ":
            row = [f"\\u{ord(c):04X}" for c in row]
        row = [c if c != "`" else "\\u0060" for c in row]
        lines.append("\t".join(row))
    return "\n".join(lines) + "\n"


def insertUsedByInUnicodeUtilsModule(check=False):
    csv = formatUsedByTable(makeUsedByTable())

    repoDir = pathlib.Path(__file__).resolve().parent.parent
    unicodeUtilsPath = repoDir / "src-js" / "fontra-core" / "src" / "unicode-utils.js"

    sourceText = unicodeUtilsPath.read_text(encoding="utf-8")

    targetString = "const usedByData = `"
    start = sourceText.find(targetString)
    assert start > 0
    start += len(targetString) + 1
    end = sourceText.find("`;\n", start)
    assert end > start

    newSourceText = sourceText[:start] + csv + sourceText[end:]

    if check:
        if sourceText != newSourceText:
            raise ValueError("new source differs from old source")
        print("all good")
    else:
        unicodeUtilsPath.write_text(newSourceText, encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", default=False)
    args = parser.parse_args()

    insertUsedByInUnicodeUtilsModule(check=args.check)
