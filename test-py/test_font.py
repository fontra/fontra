import contextlib
import pathlib

import pytest

from fontra.backends import getFileSystemBackend, opentype
from fontra.core.classes import (
    AxisValueLabel,
    DiscreteFontAxis,
    FontAxis,
    VariableGlyph,
    structure,
    unstructure,
)

opentype._USE_SOURCE_INDEX_INSTEAD_OF_UUID = True

dataDir = pathlib.Path(__file__).resolve().parent / "data"


getGlyphTestData = [
    (
        "ufo",
        {
            "name": "period",
            "sources": [
                {
                    "layerName": "default",
                    "name": "",
                    "locationBase": "default",
                }
            ],
            "layers": {
                "default": {
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "default^background": {
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [62, 0, 112, 0, 112, 120, 62, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
            },
        },
    ),
    (
        "ufo",
        {
            "name": "Aacute",
            "sources": [
                {
                    "layerName": "default",
                    "name": "",
                    "locationBase": "default",
                }
            ],
            "layers": {
                "default": {
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 0,
                                    "translateY": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 99,
                                    "translateY": 20,
                                },
                            },
                        ],
                        "xAdvance": 396,
                    },
                },
            },
        },
    ),
    (
        "designspace",
        {
            "name": "period",
            "sources": [
                {
                    "name": "",
                    "locationBase": "light-condensed",
                    "layerName": "light-condensed",
                },
                {
                    "name": "",
                    "locationBase": "bold-condensed",
                    "layerName": "bold-condensed",
                },
                {
                    "name": "",
                    "locationBase": "light-wide",
                    "layerName": "light-wide",
                },
                {
                    "name": "",
                    "locationBase": "bold-wide",
                    "layerName": "bold-wide",
                },
                {
                    "name": "",
                    "locationBase": "light-condensed-italic",
                    "layerName": "light-condensed-italic",
                },
            ],
            "layers": {
                "light-condensed": {
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "light-condensed^background": {
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [62, 0, 112, 0, 112, 120, 62, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "bold-condensed": {
                    "glyph": {
                        "xAdvance": 250,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [30, 0, 220, 0, 220, 300, 30, 300],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "light-wide": {
                    "glyph": {
                        "xAdvance": 290,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [120, 0, 170, 0, 170, 220, 120, 220],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "bold-wide": {
                    "glyph": {
                        "xAdvance": 310,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 250, 0, 250, 300, 60, 300],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "light-condensed-italic": {
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 4, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 133, 62, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0, 0],
                        },
                    }
                },
            },
        },
    ),
    (
        "designspace",
        {
            "name": "Aacute",
            "sources": [
                {
                    "name": "",
                    "locationBase": "light-condensed",
                    "layerName": "light-condensed",
                },
                {
                    "name": "",
                    "locationBase": "bold-condensed",
                    "layerName": "bold-condensed",
                },
                {
                    "name": "",
                    "locationBase": "light-wide",
                    "layerName": "light-wide",
                },
                {
                    "name": "",
                    "locationBase": "bold-wide",
                    "layerName": "bold-wide",
                },
            ],
            "layers": {
                "light-condensed": {
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 0,
                                    "translateY": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 99,
                                    "translateY": 20,
                                },
                            },
                        ],
                        "xAdvance": 396,
                    },
                },
                "bold-condensed": {
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 0,
                                    "translateY": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 204,
                                    "translateY": 0,
                                },
                            },
                        ],
                        "xAdvance": 740,
                    },
                },
                "light-wide": {
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 0,
                                    "translateY": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 494,
                                    "translateY": 20,
                                },
                            },
                        ],
                        "xAdvance": 1190,
                    },
                },
                "bold-wide": {
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 0,
                                    "translateY": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 484,
                                    "translateY": 20,
                                },
                            },
                        ],
                        "xAdvance": 1290,
                    },
                },
            },
        },
    ),
    (
        "designspace",
        {
            "name": "varcotest1",
            "sources": [
                {
                    "name": "",
                    "locationBase": "light-condensed",
                    "layerName": "light-condensed",
                },
                {
                    "name": "",
                    "locationBase": "bold-condensed",
                    "layerName": "weight=850",
                },
            ],
            "layers": {
                "light-condensed": {
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "location": {"weight": 500},
                                "transformation": {
                                    "translateX": 0,
                                    "translateY": 0,
                                    "rotation": -10,
                                    "scaleX": 1,
                                    "scaleY": 1,
                                    "skewX": 0,
                                    "skewY": 20,
                                    "tCenterX": 250,
                                    "tCenterY": 300,
                                },
                            },
                            {
                                "name": "varcotest2",
                                "location": {"flip": 70, "flop": 30},
                                "transformation": {
                                    "translateX": 527,
                                    "translateY": 410,
                                    "rotation": 0,
                                    "scaleX": 0.5,
                                    "scaleY": 0.5,
                                    "skewX": 20,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                },
                            },
                            {
                                "name": "varcotest2",
                                "location": {"flip": 20, "flop": 80},
                                "transformation": {
                                    "translateX": 627,
                                    "translateY": -175,
                                    "rotation": 10,
                                    "scaleX": 0.75,
                                    "scaleY": 0.75,
                                    "skewX": 0,
                                    "skewY": 20,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                },
                            },
                        ],
                        "xAdvance": 900,
                    },
                },
                "weight=850": {
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "location": {"weight": 100, "unknown-axis": 200},
                                "transformation": {
                                    "translateX": 0,
                                    "translateY": 0,
                                    "rotation": -10,
                                    "scaleX": 1,
                                    "scaleY": 1,
                                    "skewX": 0,
                                    "skewY": 20,
                                    "tCenterX": 250,
                                    "tCenterY": 300,
                                },
                            },
                            {
                                "name": "varcotest2",
                                "location": {"flip": 70, "flop": 30},
                                "transformation": {
                                    "translateX": 527,
                                    "translateY": 410,
                                    "rotation": 0,
                                    "scaleX": 0.5,
                                    "scaleY": 0.5,
                                    "skewX": 20,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                },
                            },
                            {
                                "name": "varcotest2",
                                "location": {"flip": 20, "flop": 80},
                                "transformation": {
                                    "translateX": 627,
                                    "translateY": -175,
                                    "rotation": 10,
                                    "scaleX": 0.75,
                                    "scaleY": 0.75,
                                    "skewX": 0,
                                    "skewY": 20,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                },
                            },
                        ],
                        "xAdvance": 900,
                    },
                },
            },
        },
    ),
    (
        "designspace",
        {
            "name": "varcotest2",
            "axes": [
                {"defaultValue": 0, "maxValue": 100, "minValue": 0, "name": "flip"},
                {"defaultValue": 0, "maxValue": 100, "minValue": 0, "name": "flop"},
            ],
            "sources": [
                {
                    "name": "",
                    "locationBase": "light-condensed",
                    "layerName": "light-condensed",
                },
                {
                    "layerName": "varco_flip",
                    "location": {"flip": 100},
                    "locationBase": "light-condensed",
                    "name": "varco_flip",
                },
                {
                    "layerName": "varco_flop",
                    "location": {"flop": 100},
                    "locationBase": "light-condensed",
                    "name": "varco_flop",
                },
                {
                    "name": "weight=850,flip=100",
                    "layerName": "weight=850,flip=100",
                    "location": {"flip": 100},
                    "locationBase": "bold-condensed",
                    "inactive": False,
                    "customData": {},
                },
            ],
            "layers": {
                "light-condensed": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 7, "isClosed": True}],
                            "coordinates": [
                                70,
                                278,
                                309,
                                278,
                                309,
                                380,
                                379,
                                380,
                                379,
                                664,
                                204,
                                664,
                                204,
                                588,
                                70,
                                588,
                            ],
                            "pointTypes": [0, 0, 0, 0, 0, 0, 0, 0],
                        },
                        "xAdvance": 500,
                    },
                },
                "varco_flip": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 7, "isClosed": True}],
                            "coordinates": [
                                70,
                                278,
                                452,
                                278,
                                452,
                                380,
                                522,
                                380,
                                522,
                                664,
                                204,
                                664,
                                204,
                                588,
                                70,
                                588,
                            ],
                            "pointTypes": [0, 0, 0, 0, 0, 0, 0, 0],
                        },
                        "xAdvance": 500,
                    },
                },
                "varco_flop": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 7, "isClosed": True}],
                            "coordinates": [
                                70,
                                37,
                                309,
                                37,
                                309,
                                139,
                                379,
                                139,
                                379,
                                664,
                                204,
                                664,
                                204,
                                588,
                                70,
                                588,
                            ],
                            "pointTypes": [0, 0, 0, 0, 0, 0, 0, 0],
                        },
                        "xAdvance": 500,
                    },
                },
                "weight=850,flip=100": {
                    "glyph": {
                        "path": {
                            "coordinates": [
                                70,
                                278,
                                452,
                                278,
                                522,
                                278,
                                522,
                                380,
                                522,
                                664,
                                204,
                                664,
                                204,
                                588,
                                70,
                                588,
                            ],
                            "pointTypes": [0, 0, 0, 0, 0, 0, 0, 0],
                            "contourInfo": [{"endPoint": 7, "isClosed": True}],
                        },
                        "components": [],
                        "xAdvance": 500,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
            },
        },
    ),
    (
        "ttf",
        {
            "name": "period",
            "layers": {
                "font-source-0": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 60, 120, 110, 120, 110, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "xAdvance": 170,
                    },
                },
                "font-source-1": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [120, 0, 120, 220, 170, 220, 170, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "xAdvance": 290,
                    },
                },
                "font-source-2": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 60, 300, 250, 300, 250, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "xAdvance": 310,
                    },
                },
                "font-source-3": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [30, 0, 30, 300, 220, 300, 220, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "xAdvance": 250,
                    },
                },
            },
            "sources": [
                {
                    "layerName": "font-source-0",
                    "locationBase": "font-source-0",
                    "name": "",
                },
                {
                    "layerName": "font-source-1",
                    "locationBase": "font-source-1",
                    "name": "",
                },
                {
                    "layerName": "font-source-2",
                    "locationBase": "font-source-2",
                    "name": "",
                },
                {
                    "layerName": "font-source-3",
                    "locationBase": "font-source-3",
                    "name": "",
                },
            ],
        },
    ),
    (
        "ttf",
        {
            "name": "tenttest",
            "layers": {
                "font-source-0": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 60, 120, 110, 120, 110, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "xAdvance": 170,
                    },
                },
                "wdth=200.01221": {
                    "glyph": {
                        "path": {
                            "coordinates": [60, 0, 60, 120, 110, 120, 110, 0],
                            "pointTypes": [0, 0, 0, 0],
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                        },
                        "xAdvance": 194.00146484375,
                    },
                    "customData": {},
                },
                "font-source-1": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [120, 0, 120, 220, 170, 220, 170, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "xAdvance": 290,
                    },
                },
            },
            "sources": [
                {
                    "layerName": "font-source-0",
                    "locationBase": "font-source-0",
                    "name": "",
                },
                {
                    "layerName": "wdth=200.01221",
                    "location": {"wdth": 200.01220703125, "wght": 100},
                    "name": "wdth=200.01221",
                },
                {
                    "layerName": "font-source-1",
                    "location": {},
                    "locationBase": "font-source-1",
                    "name": "",
                },
            ],
        },
    ),
    (
        "otf",
        {
            "name": "period",
            "layers": {
                "font-source-0": {
                    "glyph": {
                        "path": {
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                        },
                        "xAdvance": 170,
                    },
                },
                "font-source-1": {
                    "glyph": {
                        "path": {
                            "coordinates": [
                                120.0,
                                0,
                                170.0,
                                0,
                                170.0,
                                220.0,
                                120.0,
                                220.0,
                            ],
                            "pointTypes": [0, 0, 0, 0],
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                        },
                        "xAdvance": 290.0,
                    },
                },
                "font-source-2": {
                    "glyph": {
                        "path": {
                            "coordinates": [
                                60.0,
                                0,
                                250.0,
                                0,
                                250.0,
                                300.0,
                                60.0,
                                300.0,
                            ],
                            "pointTypes": [0, 0, 0, 0],
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                        },
                        "xAdvance": 310.0,
                    },
                },
                "font-source-3": {
                    "glyph": {
                        "path": {
                            "coordinates": [
                                30.0,
                                0,
                                220.0,
                                0,
                                220.0,
                                300.0,
                                30.0,
                                300.0,
                            ],
                            "pointTypes": [0, 0, 0, 0],
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                        },
                        "xAdvance": 250.0,
                    },
                },
            },
            "sources": [
                {
                    "locationBase": "font-source-0",
                    "name": "",
                    "layerName": "font-source-0",
                },
                {
                    "locationBase": "font-source-1",
                    "name": "",
                    "layerName": "font-source-1",
                },
                {
                    "locationBase": "font-source-2",
                    "name": "",
                    "layerName": "font-source-2",
                },
                {
                    "locationBase": "font-source-3",
                    "name": "",
                    "layerName": "font-source-3",
                },
            ],
        },
    ),
    (
        "ttf-VARC",
        {
            "name": "varcotest1",
            "sources": [
                {
                    "name": "",
                    "layerName": "font-source-0",
                    "locationBase": "font-source-0",
                },
                {
                    "name": "wght=900",
                    "layerName": "wght=900",
                    "location": {"V000": 0, "V001": 0, "wdth": 0, "wght": 900},
                },
            ],
            "layers": {
                "font-source-0": {
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "transformation": {
                                    "rotation": -10.01953125,
                                    "skewY": 19.9951171875,
                                    "tCenterX": 250,
                                    "tCenterY": 300,
                                },
                                "location": {"wght": 0.5},
                            },
                            {
                                "name": "varcotest2",
                                "transformation": {
                                    "translateX": 527,
                                    "translateY": 410,
                                    "scaleX": 0.5,
                                    "scaleY": 0.5,
                                    "skewX": 19.9951171875,
                                },
                                "location": {
                                    "V000": 0.70001220703125,
                                    "V001": 0.29998779296875,
                                },
                            },
                            {
                                "name": "varcotest2",
                                "transformation": {
                                    "translateX": 627,
                                    "translateY": -175,
                                    "rotation": 10.01953125,
                                    "scaleX": 0.75,
                                    "scaleY": 0.75,
                                    "skewY": 19.9951171875,
                                },
                                "location": {
                                    "V000": 0.20001220703125,
                                    "V001": 0.79998779296875,
                                },
                            },
                        ],
                        "xAdvance": 900,
                    }
                },
                "wght=900": {
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "transformation": {
                                    "rotation": -10.01953125,
                                    "skewY": 19.9951171875,
                                    "tCenterX": 250,
                                    "tCenterY": 300,
                                },
                                "location": {"wght": 0},
                            },
                            {
                                "name": "varcotest2",
                                "transformation": {
                                    "translateX": 527,
                                    "translateY": 410,
                                    "scaleX": 0.5,
                                    "scaleY": 0.5,
                                    "skewX": 19.9951171875,
                                },
                                "location": {
                                    "V000": 0.70001220703125,
                                    "V001": 0.29998779296875,
                                },
                            },
                            {
                                "name": "varcotest2",
                                "transformation": {
                                    "translateX": 627,
                                    "translateY": -175,
                                    "rotation": 10.01953125,
                                    "scaleX": 0.75,
                                    "scaleY": 0.75,
                                    "skewY": 19.9951171875,
                                },
                                "location": {
                                    "V000": 0.20001220703125,
                                    "V001": 0.79998779296875,
                                },
                            },
                        ],
                        "xAdvance": 900,
                    }
                },
            },
        },
    ),
]


testFontPaths = {
    "designspace": dataDir / "mutatorsans" / "MutatorSans.designspace",
    "ufo": dataDir / "mutatorsans" / "MutatorSansLightCondensed.ufo",
    "ttf": dataDir / "mutatorsans" / "MutatorSans.ttf",
    "otf": dataDir / "mutatorsans" / "MutatorSans.otf",
    "ttf-VARC": dataDir / "mutatorsans" / "MutatorSans-VARC.ttf",
}


def getTestFont(testFontName):
    fontPath = testFontPaths[testFontName]
    return getFileSystemBackend(fontPath)


getGlyphNamesTestData = [
    ("designspace", 54, ["A", "Aacute", "Adieresis", "B"]),
    ("ufo", 54, ["A", "Aacute", "Adieresis", "B"]),
]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "testFontName, numGlyphs, firstFourGlyphNames", getGlyphNamesTestData
)
async def test_getGlyphNames(testFontName, numGlyphs, firstFourGlyphNames):
    font = getTestFont(testFontName)
    async with contextlib.aclosing(font):
        glyphNames = sorted(await font.getGlyphMap())
        assert numGlyphs == len(glyphNames)
        assert firstFourGlyphNames == sorted(glyphNames)[:4]


getGlyphMapTestData = [
    (
        "designspace",
        54,
        {"A": [ord("A"), ord("a")], "B": [ord("B"), ord("b")], "I.narrow": []},
    ),
    ("ufo", 54, {"A": [ord("A"), ord("a")], "B": [ord("B"), ord("b")], "I.narrow": []}),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("testFontName, numGlyphs, testMapping", getGlyphMapTestData)
async def test_getGlyphMap(testFontName, numGlyphs, testMapping):
    font = getTestFont(testFontName)
    async with contextlib.aclosing(font):
        glyphMap = await font.getGlyphMap()
        assert numGlyphs == len(glyphMap)
        for glyphName, unicodes in testMapping.items():
            assert glyphMap[glyphName] == unicodes


@pytest.mark.asyncio
@pytest.mark.parametrize("testFontName, expectedGlyph", getGlyphTestData)
async def test_getGlyph(testFontName, expectedGlyph):
    expectedGlyph = structure(expectedGlyph, VariableGlyph)
    font = getTestFont(testFontName)
    async with contextlib.aclosing(font):
        glyph = await font.getGlyph(expectedGlyph.name)
        assert glyph == expectedGlyph
        assert unstructure(glyph) == unstructure(expectedGlyph)


getAxesTestData = [
    (
        "designspace",
        [
            FontAxis(
                defaultValue=100.0,
                maxValue=900.0,
                mapping=[[100.0, 150.0], [900.0, 850.0]],
                minValue=100.0,
                label="weight",
                name="weight",
                tag="wght",
            ),
            FontAxis(
                defaultValue=0.0,
                maxValue=1000.0,
                minValue=0.0,
                label="width",
                name="width",
                tag="wdth",
            ),
            DiscreteFontAxis(
                name="italic",
                label="italic",
                tag="ital",
                values=[0.0, 1.0],
                defaultValue=0.0,
                mapping=[],
                hidden=False,
                valueLabels=[
                    AxisValueLabel(
                        name="Upright",
                        value=0.0,
                        linkedValue=1.0,
                        elidable=True,
                    ),
                    AxisValueLabel(
                        name="Italic",
                        value=1.0,
                    ),
                ],
            ),
        ],
    ),
    ("ufo", []),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("testFontName, expectedGlobalAxes", getAxesTestData)
async def test_getAxes(testFontName, expectedGlobalAxes):
    font = getTestFont(testFontName)
    globalAxes = (await font.getAxes()).axes
    assert expectedGlobalAxes == globalAxes


getLibTestData = [
    ("designspace", 0),
    ("ufo", 16),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("testFontName, expectedLibLen", getLibTestData)
async def test_getCustomData(testFontName, expectedLibLen):
    font = getTestFont(testFontName)
    lib = await font.getCustomData()
    assert expectedLibLen == len(lib)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "testFontName, expectedUnitsPerEm",
    [
        ("designspace", 1000),
        ("ufo", 1000),
        ("ttf", 1000),
    ],
)
async def test_getUnitsPerEm(testFontName, expectedUnitsPerEm):
    font = getTestFont(testFontName)
    unitsPerEm = await font.getUnitsPerEm()
    assert expectedUnitsPerEm == unitsPerEm


@pytest.mark.asyncio
async def test_cff2InterpolationCompatibility():
    # Test the workaround for https://github.com/fonttools/fonttools/issues/2838
    font = getTestFont("otf")
    glyph = await font.getGlyph("S")
    layers = list(glyph.layers.values())
    firstPointTypes = layers[0].glyph.path.pointTypes
    for layer in layers:
        assert layer.glyph.path.pointTypes == firstPointTypes


@pytest.mark.asyncio
@pytest.mark.parametrize("testFont", ["otf", "ttf"])
async def test_glyphPathConversion(testFont):
    font = getTestFont(testFont)
    glyph = await font.getGlyph("B")
    glyphWithUnpackedPaths = glyph.convertToPaths()
    glyphWithPackedPaths = glyphWithUnpackedPaths.convertToPackedPaths()
    assert glyph == glyphWithPackedPaths
    assert glyph is not glyphWithPackedPaths
    assert glyph is glyph.convertToPackedPaths()
    assert glyphWithUnpackedPaths is glyphWithUnpackedPaths.convertToPaths()
