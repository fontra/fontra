from ..core.classes import FontSource, LineMetric
from ..core.protocols import WritableFontBackend

defaultLineMetrics = {
    "ascender": (750, 16),
    "descender": (-250, -16),
    "xHeight": (500, 16),
    "capHeight": (750, 16),
    "baseline": (0, -16),
}


PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY = "fontra.projectGlyphSets"


async def populateBackend(backend: WritableFontBackend) -> None:
    import secrets

    if len(await backend.getSources()) > 1:
        raise TypeError("backend already populated with multiple sources")

    sources = {
        secrets.token_hex(4): FontSource(
            name="Regular",
            lineMetricsHorizontalLayout={
                name: LineMetric(value=value, zone=zone)
                for name, (value, zone) in defaultLineMetrics.items()
            },
        )
    }

    customData = await backend.getCustomData()

    customData[PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY] = [
        {
            "name": "GF Latin Kernel",
            "url": (
                "https://cdn.jsdelivr.net/gh/googlefonts/glyphsets/"
                + "data/results/txt/nice-names/GF_Latin_Kernel.txt"
            ),
            "dataFormat": "glyph-names",
            "commentChars": "#",
        },
    ]

    await backend.putSources(sources)
    await backend.putCustomData(customData)
