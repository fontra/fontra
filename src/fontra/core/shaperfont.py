import io

from fontTools.fontBuilder import FontBuilder


def buildShaperFont(
    unitsPerEm: int,
    glyphOrder: list[str],
    featureText: str,
    axes: list[dict],
    rules: list,
):
    error = None
    fontData = None
    try:
        fb = FontBuilder(unitsPerEm=unitsPerEm)
        fb.setupGlyphOrder(glyphOrder)
        fb.setupPost(keepGlyphNames=False)
        if axes:
            fb.setupFvar(
                [
                    (
                        axis["tag"],
                        axis["minValue"],
                        axis["defaultValue"],
                        axis["maxValue"],
                        axis["name"],
                    )
                    for axis in axes
                ],
                [],
            )
        fb.addOpenTypeFeatures(featureText)
        # TODO: add rules fea var

        f = io.BytesIO()
        fb.save(f)
        fontData = f.getvalue()
    except Exception as e:
        error = repr(e)

    return {"fontData": fontData, "error": error}
