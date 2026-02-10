import io

from fontTools.feaLib.error import FeatureLibError
from fontTools.fontBuilder import FontBuilder


def buildShaperFont(
    unitsPerEm: int,
    glyphOrder: list[str],
    featureText: str,
    axes: list[list],
    rules: list,
):
    error = None
    fontData = None
    try:
        fb = FontBuilder(unitsPerEm=unitsPerEm)
        fb.setupGlyphOrder(glyphOrder)
        fb.setupNameTable({}, mac=False)
        fb.setupPost(keepGlyphNames=False)
        if axes:
            fb.setupFvar(
                [
                    (tag, minValue, defaultValue, maxValue, tag)
                    for tag, minValue, defaultValue, maxValue in axes
                ],
                [],
            )
        fb.addOpenTypeFeatures(featureText)
        # TODO: add rules fea var

        f = io.BytesIO()
        fb.save(f)
        fontData = f.getvalue()
    except FeatureLibError as e:
        error = str(e)
    except Exception as e:
        error = repr(e)

    return {"fontData": fontData, "error": error}
