import pathlib

from fontTools.misc.roundTools import otRound
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ufoLib import UFOReader


def numToString(number):
    return str(otRound(number))


def makeSVG(pathString, width, height):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        + f'viewBox="0 0 {width} {height}">'
        + f'<path d="{pathString}"/></svg>\n'
    )


def makeCursorSVG(pathString, width, height):
    # For cursors, the maximum size seems to be 32:
    # https://stackoverflow.com/questions/6648279/cursor-256x256-px-size#answer-6648759

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" '
        + f'viewBox="0 0 {width} {height}">'
        + f'<defs><path id="icon-path" d="{pathString}"/></defs>'
        + '<use href="#icon-path" stroke="rgb(255,255,255)" stroke-width="63"/>'
        + '<use href="#icon-path"/></svg>\n'
    )


thisDir = pathlib.Path(__file__).resolve().parent
ufoPath = thisDir / "fontra-icons.ufo"
imagesDir = thisDir.parent / "src-js" / "fontra-core" / "assets" / "images"


reader = UFOReader(ufoPath)

glyphSet = reader.getGlyphSet()

iconNames = sorted(
    glyphName
    for glyphName in glyphSet.keys()
    if glyphName != "space" and glyphName[0] not in "._" and len(glyphName) > 1
)

for iconName in iconNames:
    pen = SVGPathPen(glyphSet, numToString)
    glyph = glyphSet[iconName]
    glyph.draw(TransformPen(pen, (1, 0, 0, -1, 0, 800)))
    svgPath = pen.getCommands()
    iconPath = imagesDir / f"{iconName}.svg"

    if iconName.startswith("cursor-"):
        iconPath.write_text(makeCursorSVG(svgPath, glyph.width, 1000))
    else:
        iconPath.write_text(makeSVG(svgPath, glyph.width, 1000))
