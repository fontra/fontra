from fontra.core.classes import FontAxis, Kerning
from fontra.core.kernutils import (
    classifyGlyphsByDirection,
    flipKerningDirection,
    splitKerningByDirection,
)

glyphMap = {
    "A": [ord("A")],
    "A.alt": [],
    "C": [ord("C")],
    "D": [ord("D")],
    "F": [ord("F")],
    "O": [ord("O")],
    "O.alt": [],
    "V": [ord("V")],
    "alef-ar": [0x0627],
    "alef-ar.init": [],
    "beh-ar": [0x0628],
    "beh-ar.init": [],
    "zero": [ord("0")],
    "period": [ord(".")],
    "comma": [ord(",")],
}

featureText = """
feature salt {
  sub A by A.alt;
  sub O by O.alt;
} salt;

feature init {
  sub alef-ar by alef-ar.init;
  sub beh-ar by beh-ar.init;
} init;
"""

expectedLTRGlyphs = {"A", "A.alt", "C", "D", "F", "O", "O.alt", "V", "zero"}
expectedRTLGlyphs = {"alef-ar", "alef-ar.init", "beh-ar", "beh-ar.init"}


def test_classifyGlyphsByDirection():
    ltrGlyphs, rtlGlyphs = classifyGlyphsByDirection(
        glyphMap,
        featureText,
        [
            FontAxis(
                name="Weight",
                tag="wght",
                minValue=100,
                defaultValue=400,
                maxValue=900,
                label="Weight",
            )
        ],
    )
    assert ltrGlyphs == expectedLTRGlyphs
    assert rtlGlyphs == expectedRTLGlyphs


kerningData = Kerning(
    groupsSide1={
        "A": ["A", "A.alt"],
        "O": ["O", "O.alt", "D"],
        "alef": ["alef-ar", "alef-ar.init"],
    },
    groupsSide2={
        "A": ["A", "A.alt"],
        "O": ["O", "O.alt", "C"],
        "beh": ["beh-ar", "beh-ar.init"],
    },
    sourceIdentifiers=["-"],
    values={
        "@A": {"@O": [-15], "V": [-20]},
        "F": {"@O": [-10], "period": [-13]},
        "@alef": {"@beh": [-11], "period": [-9]},
    },
)


expectedFlippedKerningData = Kerning(
    groupsSide1={
        "A": ["A", "A.alt"],
        "O": ["O", "O.alt", "C"],
        "beh": ["beh-ar", "beh-ar.init"],
    },
    groupsSide2={
        "A": ["A", "A.alt"],
        "O": ["O", "O.alt", "D"],
        "alef": ["alef-ar", "alef-ar.init"],
    },
    sourceIdentifiers=["-"],
    values={
        "@O": {"@A": [-15], "F": [-10]},
        "V": {"@A": [-20]},
        "period": {"F": [-13], "@alef": [-9]},
        "@beh": {"@alef": [-11]},
    },
)


def test_flipKerningDirection():
    flippedKerning = flipKerningDirection(kerningData)
    assert flippedKerning == expectedFlippedKerningData


expectedLTRKerning = Kerning(
    groupsSide1={"A": ["A", "A.alt"], "O": ["O", "O.alt", "D"]},
    groupsSide2={"A": ["A", "A.alt"], "O": ["O", "O.alt", "C"]},
    sourceIdentifiers=["-"],
    values={"@A": {"@O": [-15], "V": [-20]}, "F": {"@O": [-10], "period": [-13]}},
)

expectedRTLKerning = Kerning(
    groupsSide1={"alef": ["alef-ar", "alef-ar.init"]},
    groupsSide2={"beh": ["beh-ar", "beh-ar.init"]},
    sourceIdentifiers=["-"],
    values={"@alef": {"@beh": [-11], "period": [-9]}},
)


def test_splitKerningByDirection():
    ltrGlyphs, rtlGlyphs = classifyGlyphsByDirection(glyphMap, featureText, [])
    ltrKerning, rtlKerning = splitKerningByDirection(kerningData, ltrGlyphs, rtlGlyphs)

    assert ltrKerning == expectedLTRKerning
    assert rtlKerning == expectedRTLKerning
