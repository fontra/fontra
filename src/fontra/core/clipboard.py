from typing import Any
from xml.etree.ElementTree import ParseError

from fontTools.pens.boundsPen import ControlBoundsPen
from fontTools.pens.pointPen import GuessSmoothPointPen, SegmentToPointPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPointPen
from fontTools.svgLib import SVGPath
from fontTools.ufoLib.errors import GlifLibError
from fontTools.ufoLib.glifLib import readGlyphFromString, writeGlyphToString

from ..backends.designspace import (
    UFOGlyph,
    populateUFOLayerGlyph,
    readGlyphOrCreate,
    unpackAnchors,
    unpackGuidelines,
    unpackImage,
)
from .classes import StaticGlyph
from .path import PackedPathPointPen

XMLErrors: tuple[Any, ...]
try:
    from lxml.etree import XMLSyntaxError
except ImportError:
    XMLErrors = (ParseError,)
else:
    XMLErrors = (ParseError, XMLSyntaxError)


def parseClipboard(data: str) -> StaticGlyph | None:
    if "<svg" in data:
        return parseSVG(data)
    if "<?xml" in data and "<glyph " in data:
        return parseGLIF(data)
    return None


def parseSVG(data: str) -> StaticGlyph | None:
    try:
        svgPath = SVGPath.fromstring(
            data.encode("utf-8"), transform=(1, 0, 0, -1, 0, 0)
        )
    except XMLErrors:
        return None
    recPen = RecordingPen()
    svgPath.draw(recPen)
    boundsPen = ControlBoundsPen(None)
    recPen.replay(boundsPen)
    if boundsPen.bounds is None:
        return None
    xMin, yMin, xMax, yMax = boundsPen.bounds

    pen = PackedPathPointPen()
    tPen = TransformPointPen(pen, (1, 0, 0, 1, 0, -yMin))
    recPen.replay(SegmentToPointPen(GuessSmoothPointPen(tPen)))

    return StaticGlyph(path=pen.getPath(), xAdvance=xMax)


def parseGLIF(data: str) -> StaticGlyph | None:
    pen = PackedPathPointPen()
    ufoGlyph = UFOGlyph()
    try:
        readGlyphFromString(
            data,
            glyphObject=ufoGlyph,
            pointPen=pen,
        )
    except GlifLibError:
        return None
    return StaticGlyph(
        path=pen.getPath(),
        components=pen.components,
        xAdvance=ufoGlyph.width,
        anchors=unpackAnchors(ufoGlyph.anchors),
        guidelines=unpackGuidelines(ufoGlyph.guidelines),
        image=unpackImage(ufoGlyph.image),
    )


def serializeStaticGlyphAsGLIF(
    glyphName: str, staticGlyph: StaticGlyph, codePoints: list[int]
) -> str:
    layerGlyph = readGlyphOrCreate({}, glyphName, codePoints)
    drawPointsFunc = populateUFOLayerGlyph(layerGlyph, staticGlyph)
    return writeGlyphToString(glyphName, layerGlyph, drawPointsFunc, validate=False)
