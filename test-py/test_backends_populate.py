import pathlib

import pytest

from fontra.backends import getFileSystemBackend, newFileSystemBackend
from fontra.backends.populate import populateBackend
from fontra.core.classes import FontSource, LineMetric

expectedSource = FontSource(
    name="Regular",
    lineMetricsHorizontalLayout={
        "ascender": LineMetric(value=750, zone=16),
        "descender": LineMetric(value=-250, zone=-16),
        "xHeight": LineMetric(value=500, zone=16),
        "capHeight": LineMetric(value=750, zone=16),
        "baseline": LineMetric(value=0, zone=-16),
    },
)


expectedCustomData = {
    "fontra.projectGlyphSets": [
        {
            "commentChars": "#",
            "dataFormat": "glyph-names",
            "name": "GF Latin Kernel",
            "url": "https://cdn.jsdelivr.net/gh/googlefonts/glyphsets/"
            + "data/results/txt/nice-names/GF_Latin_Kernel.txt",
        }
    ]
}


@pytest.mark.parametrize("extension", [".fontra", ".designspace", ".ufo"])
async def test_populate(tmpdir, extension):
    tmpdir = pathlib.Path(tmpdir)

    backendPath = tmpdir / f"test{extension}"

    backend = newFileSystemBackend(backendPath)

    await populateBackend(backend)

    await backend.aclose()

    reopenedBackend = getFileSystemBackend(backendPath)
    sources = await reopenedBackend.getSources()
    customData = await reopenedBackend.getCustomData()

    assert len(sources) == 1
    [source] = sources.values()
    assert source == expectedSource

    assert customData == expectedCustomData
