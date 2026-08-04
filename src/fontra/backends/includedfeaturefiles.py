import io
import pathlib
import re
from typing import Generator

from fontTools.feaLib.ast import IncludeStatement
from fontTools.feaLib.error import FeatureLibError
from fontTools.feaLib.parser import Parser


def extractIncludedFeatureFiles(
    featureText: str, includeDir: pathlib.Path
) -> list[pathlib.Path]:
    return sorted(set(_extractIncludedFeatureFiles(featureText, includeDir, None)))


def _extractIncludedFeatureFiles(
    featureText: str,
    includeDir: pathlib.Path,
    parentDir: pathlib.Path | None,
    recursionLevel: int = 0,
) -> Generator[pathlib.Path, None, None]:
    if recursionLevel > 50:
        raise FeatureLibError("Too many recursive includes", None)
    includeDirs = [includeDir] if parentDir is None else [includeDir, parentDir]
    for fileName in _parseFeaSource(featureText):
        for d in includeDirs:
            p = d / fileName
            if not p.exists():
                continue
            p = p.resolve()
            yield p
            yield from _extractIncludedFeatureFiles(
                p.read_text("utf-8", "replace"),
                includeDir,
                p.parent,
                recursionLevel + 1,
            )
            break


_feaIncludePat = re.compile(r"include\s*\(([^)]+)\)")


def _parseFeaSource(featureText: str) -> Generator[str, None, None]:
    pos = 0
    while True:
        m = _feaIncludePat.search(featureText, pos)
        if m is None:
            break
        pos = m.end()

        lineStart = featureText.rfind("\n", 0, m.start())
        lineEnd = featureText.find("\n", m.end())
        if lineStart == -1:
            lineStart = 0
        if lineEnd == -1:
            lineEnd = len(featureText)
        line = featureText[lineStart:lineEnd]
        f = io.StringIO(line)
        p = Parser(f, followIncludes=False)
        for st in p.parse().statements:
            if isinstance(st, IncludeStatement):
                yield st.filename
