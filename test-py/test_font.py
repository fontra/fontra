import contextlib
import pathlib
from dataclasses import asdict

import pytest

from fontra.backends import getFileSystemBackend
from fontra.core.classes import (
    AxisValueLabel,
    GlobalAxis,
    GlobalDiscreteAxis,
    VariableGlyph,
    structure,
)

dataDir = pathlib.Path(__file__).resolve().parent / "data"


getGlyphTestData = [
    (
        "ufo",
        {
            "name": "period",
            "sources": [
                {
                    "layerName": "MutatorSansLightCondensed/foreground",
                    "name": "default",
                }
            ],
            "layers": {
                "MutatorSansLightCondensed/foreground": {
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "MutatorSansLightCondensed/background": {
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
                    "location": {},
                    "layerName": "MutatorSansLightCondensed/foreground",
                    "name": "default",
                }
            ],
            "layers": {
                "MutatorSansLightCondensed/foreground": {
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
                    "name": "LightCondensed",
                    "location": {"italic": 0, "weight": 150.0, "width": 0.0},
                    "layerName": "MutatorSansLightCondensed/foreground",
                },
                {
                    "name": "BoldCondensed",
                    "location": {"italic": 0, "weight": 850.0, "width": 0.0},
                    "layerName": "MutatorSansBoldCondensed/foreground",
                },
                {
                    "name": "LightWide",
                    "location": {"italic": 0, "weight": 150.0, "width": 1000.0},
                    "layerName": "MutatorSansLightWide/foreground",
                },
                {
                    "name": "BoldWide",
                    "location": {"italic": 0, "weight": 850.0, "width": 1000.0},
                    "layerName": "MutatorSansBoldWide/foreground",
                },
                {
                    "name": "LightCondensedItalic",
                    "location": {"italic": 1, "weight": 150.0, "width": 0.0},
                    "layerName": "MutatorSansLightCondensedItalic/public.default",
                },
            ],
            "layers": {
                "MutatorSansLightCondensed/foreground": {
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "MutatorSansLightCondensed/background": {
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [62, 0, 112, 0, 112, 120, 62, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "MutatorSansBoldCondensed/foreground": {
                    "glyph": {
                        "xAdvance": 250,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [30, 0, 220, 0, 220, 300, 30, 300],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "MutatorSansLightWide/foreground": {
                    "glyph": {
                        "xAdvance": 290,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [120, 0, 170, 0, 170, 220, 120, 220],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "MutatorSansBoldWide/foreground": {
                    "glyph": {
                        "xAdvance": 310,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 250, 0, 250, 300, 60, 300],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                "MutatorSansLightCondensedItalic/public.default": {
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
                    "name": "LightCondensed",
                    "location": {"italic": 0, "weight": 150.0, "width": 0.0},
                    "layerName": "MutatorSansLightCondensed/foreground",
                },
                {
                    "name": "BoldCondensed",
                    "location": {"italic": 0, "weight": 850.0, "width": 0.0},
                    "layerName": "MutatorSansBoldCondensed/foreground",
                },
                {
                    "name": "LightWide",
                    "location": {"italic": 0, "weight": 150.0, "width": 1000.0},
                    "layerName": "MutatorSansLightWide/foreground",
                },
                {
                    "name": "BoldWide",
                    "location": {"italic": 0, "weight": 850.0, "width": 1000.0},
                    "layerName": "MutatorSansBoldWide/foreground",
                },
            ],
            "layers": {
                "MutatorSansLightCondensed/foreground": {
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
                "MutatorSansBoldCondensed/foreground": {
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
                "MutatorSansLightWide/foreground": {
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
                "MutatorSansBoldWide/foreground": {
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
                    "name": "LightCondensed",
                    "location": {"italic": 0, "weight": 150.0, "width": 0.0},
                    "layerName": "MutatorSansLightCondensed/foreground",
                },
                {
                    "name": "weight=850",
                    "location": {"italic": 0, "weight": 850.0, "width": 0.0},
                    "layerName": "weight=850",
                },
            ],
            "layers": {
                "MutatorSansLightCondensed/foreground": {
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
                    "layerName": "MutatorSansLightCondensed/foreground",
                    "location": {"italic": 0, "weight": 150.0, "width": 0.0},
                    "name": "LightCondensed",
                },
                {
                    "layerName": "MutatorSansLightCondensed/varco_flip",
                    "location": {"flip": 100, "flop": 0},
                    "name": "varco_flip",
                },
                {
                    "layerName": "MutatorSansLightCondensed/varco_flop",
                    "location": {"flip": 0, "flop": 100},
                    "name": "varco_flop",
                },
                {
                    "name": "weight=850,flip=100",
                    "layerName": "weight=850,flip=100",
                    "location": {"flip": 100, "weight": 850},
                    "inactive": False,
                    "customData": {},
                },
            ],
            "layers": {
                "MutatorSansLightCondensed/foreground": {
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
                "MutatorSansLightCondensed/varco_flip": {
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
                "MutatorSansLightCondensed/varco_flop": {
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
                "<default>": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 60, 120, 110, 120, 110, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "xAdvance": 170,
                    },
                },
                "wdth=1": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [120, 0, 120, 220, 170, 220, 170, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "xAdvance": 290,
                    },
                },
                "wdth=1,wght=1": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 60, 300, 250, 300, 250, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "xAdvance": 310,
                    },
                },
                "wght=1": {
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
                    "layerName": "<default>",
                    "location": {"wdth": 0, "wght": 0},
                    "name": "<default>",
                },
                {
                    "layerName": "wdth=1",
                    "location": {"wdth": 1.0, "wght": 0},
                    "name": "wdth=1",
                },
                {
                    "layerName": "wdth=1,wght=1",
                    "location": {"wdth": 1.0, "wght": 1.0},
                    "name": "wdth=1,wght=1",
                },
                {
                    "layerName": "wght=1",
                    "location": {"wdth": 0, "wght": 1.0},
                    "name": "wght=1",
                },
            ],
        },
    ),
    (
        "otf",
        {
            "name": "period",
            "layers": {
                "<default>": {
                    "glyph": {
                        "path": {
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                        },
                        "xAdvance": 170,
                    },
                },
                "wdth=1": {
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
                "wdth=1,wght=1": {
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
                "wght=1": {
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
                    "location": {"wdth": 0, "wght": 0},
                    "name": "<default>",
                    "layerName": "<default>",
                },
                {
                    "location": {"wdth": 1.0, "wght": 0},
                    "name": "wdth=1",
                    "layerName": "wdth=1",
                },
                {
                    "location": {"wdth": 1.0, "wght": 1.0},
                    "name": "wdth=1,wght=1",
                    "layerName": "wdth=1,wght=1",
                },
                {
                    "location": {"wdth": 0, "wght": 1.0},
                    "name": "wght=1",
                    "layerName": "wght=1",
                },
            ],
        },
    ),
    (
        "ttf-glyf1",
        {
            "name": "varcotest1",
            "axes": [],
            "sources": [
                {
                    "name": "<default>",
                    "layerName": "<default>",
                    "location": {"wdth": 0, "wght": 0, "V000": 0, "V001": 0},
                    "inactive": False,
                    "customData": {},
                }
            ],
            "layers": {
                "<default>": {
                    "glyph": {
                        "path": {
                            "coordinates": [],
                            "pointTypes": [],
                            "contourInfo": [],
                        },
                        "components": [
                            {
                                "name": "A",
                                "transformation": {
                                    "translateX": 0,
                                    "translateY": 0,
                                    "rotation": -10.01953125,
                                    "scaleX": 1,
                                    "scaleY": 1,
                                    "skewX": 0,
                                    "skewY": 19.9951171875,
                                    "tCenterX": 250.0,
                                    "tCenterY": 300.0,
                                },
                                "location": {
                                    "wdth": 0,
                                    "wght": 0.5,
                                    "V000": 0,
                                    "V001": 0,
                                },
                            },
                            {
                                "name": "varcotest2",
                                "transformation": {
                                    "translateX": 527.0,
                                    "translateY": 410.0,
                                    "rotation": 0,
                                    "scaleX": 0.5,
                                    "scaleY": 0.5,
                                    "skewX": -19.9951171875,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                },
                                "location": {
                                    "wdth": 0,
                                    "wght": 0,
                                    "V000": 0.70001220703125,
                                    "V001": 0.29998779296875,
                                },
                            },
                            {
                                "name": "varcotest2",
                                "transformation": {
                                    "translateX": 627.0,
                                    "translateY": -175.0,
                                    "rotation": 10.01953125,
                                    "scaleX": 0.75,
                                    "scaleY": 0.75,
                                    "skewX": 0,
                                    "skewY": 19.9951171875,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                },
                                "location": {
                                    "wdth": 0,
                                    "wght": 0,
                                    "V000": 0.20001220703125,
                                    "V001": 0.79998779296875,
                                },
                            },
                        ],
                        "xAdvance": 900,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                }
            },
            "customData": {},
        },
    ),
]


testFontPaths = {
    "designspace": dataDir / "mutatorsans" / "MutatorSans.designspace",
    "ufo": dataDir / "mutatorsans" / "MutatorSansLightCondensed.ufo",
    "ttf": dataDir / "mutatorsans" / "MutatorSans.ttf",
    "otf": dataDir / "mutatorsans" / "MutatorSans.otf",
    "ttf-glyf1": dataDir / "mutatorsans" / "MutatorSans-glyf1.ttf",
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
    with contextlib.closing(font):
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
    with contextlib.closing(font):
        glyphMap = await font.getGlyphMap()
        assert numGlyphs == len(glyphMap)
        for glyphName, unicodes in testMapping.items():
            assert glyphMap[glyphName] == unicodes


@pytest.mark.asyncio
@pytest.mark.parametrize("testFontName, expectedGlyph", getGlyphTestData)
async def test_getGlyph(testFontName, expectedGlyph):
    expectedGlyph = structure(expectedGlyph, VariableGlyph)
    font = getTestFont(testFontName)
    with contextlib.closing(font):
        glyph = await font.getGlyph(expectedGlyph.name)
        assert glyph == expectedGlyph
        assert asdict(glyph) == asdict(expectedGlyph)


getGlobalAxesTestData = [
    (
        "designspace",
        [
            GlobalAxis(
                defaultValue=0.0,
                maxValue=1000.0,
                minValue=0.0,
                label="width",
                name="width",
                tag="wdth",
            ),
            GlobalAxis(
                defaultValue=100.0,
                maxValue=900.0,
                mapping=[[100.0, 150.0], [900.0, 850.0]],
                minValue=100.0,
                label="weight",
                name="weight",
                tag="wght",
            ),
            GlobalDiscreteAxis(
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
@pytest.mark.parametrize("testFontName, expectedGlobalAxes", getGlobalAxesTestData)
async def test_getGlobalAxes(testFontName, expectedGlobalAxes):
    font = getTestFont(testFontName)
    globalAxes = await font.getGlobalAxes()
    assert expectedGlobalAxes == globalAxes


getLibTestData = [
    ("designspace", 0),
    ("ufo", 0),
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
