import math
import pathlib
from dataclasses import asdict

import pytest
from fontTools.misc.transform import DecomposedTransform, Transform
from fontTools.pens.recordingPen import RecordingPointPen

from fontra.backends import getFileSystemBackend
from fontra.core.classes import (
    Component,
    FontAxis,
    FontSource,
    Guideline,
    LineMetric,
    StaticGlyph,
)
from fontra.core.instancer import (
    FontInstancer,
    FontSourcesInstancer,
    LocationCoordinateSystem,
    prependTransformToDecomposed,
)
from fontra.core.path import Contour, Path

commonFontsDir = pathlib.Path(__file__).parent.parent / "test-common" / "fonts"


@pytest.fixture
def testFont():
    return getFileSystemBackend(commonFontsDir / "MutatorSans.fontra")


@pytest.fixture
def instancer(testFont):
    return FontInstancer(testFont)


testData: list = [
    (
        "period",
        [({}, LocationCoordinateSystem.SOURCE)],
        StaticGlyph(
            xAdvance=170,
            path=Path(
                contours=[
                    Contour(
                        points=[
                            {"x": 60.0, "y": 0.0},
                            {"x": 110.0, "y": 0.0},
                            {"x": 110.0, "y": 120.0},
                            {"x": 60.0, "y": 120.0},
                        ],
                        isClosed=True,
                    )
                ]
            ),
        ),
    ),
    (
        "period",
        [({"weight": 500}, LocationCoordinateSystem.SOURCE)],
        StaticGlyph(
            xAdvance=210,
            path=Path(
                contours=[
                    Contour(
                        points=[
                            {"x": 45.0, "y": 0.0},
                            {"x": 165.0, "y": 0.0},
                            {"x": 165.0, "y": 210.0},
                            {"x": 45.0, "y": 210.0},
                        ],
                        isClosed=True,
                    )
                ]
            ),
        ),
    ),
    (
        "Aacute",
        [
            ({}, LocationCoordinateSystem.USER),
            ({}, LocationCoordinateSystem.SOURCE),
            ({"weight": 100}, LocationCoordinateSystem.USER),
            ({"weight": 150}, LocationCoordinateSystem.SOURCE),
        ],
        StaticGlyph(
            xAdvance=396,
            components=[
                Component(
                    name="A",
                    transformation=DecomposedTransform(),
                    location={},
                ),
                Component(
                    name="acute",
                    transformation=DecomposedTransform(
                        translateX=99.0, translateY=20.0
                    ),
                    location={},
                ),
            ],
        ),
    ),
    (
        "varcotest1",
        [({}, LocationCoordinateSystem.SOURCE)],
        StaticGlyph(
            xAdvance=900,
            components=[
                Component(
                    name="A",
                    transformation=DecomposedTransform(
                        rotation=-10.0, skewY=20.0, tCenterX=250.0, tCenterY=300.0
                    ),
                    location={"weight": 500.0, "unknown-axis": 0},
                ),
                Component(
                    name="varcotest2",
                    transformation=DecomposedTransform(
                        translateX=527.0,
                        translateY=410.0,
                        scaleX=0.5,
                        scaleY=0.5,
                        skewX=20.0,
                    ),
                    location={"flip": 70.0, "flop": 30.0},
                ),
                Component(
                    name="varcotest2",
                    transformation=DecomposedTransform(
                        translateX=627.0,
                        translateY=-175.0,
                        rotation=10.0,
                        scaleX=0.75,
                        scaleY=0.75,
                        skewY=20.0,
                    ),
                    location={"flip": 20.0, "flop": 80.0},
                ),
            ],
        ),
    ),
    (
        "varcotest1",
        [
            ({"weight": 500, "width": 500}, LocationCoordinateSystem.USER),
            ({"weight": 500, "width": 500}, LocationCoordinateSystem.SOURCE),
        ],
        StaticGlyph(
            xAdvance=900,
            components=[
                Component(
                    name="A",
                    transformation=DecomposedTransform(
                        rotation=-10.0, skewY=20.0, tCenterX=250.0, tCenterY=300.0
                    ),
                    location={"weight": 300.0, "unknown-axis": 100},
                ),
                Component(
                    name="varcotest2",
                    transformation=DecomposedTransform(
                        translateX=527.0,
                        translateY=410.0,
                        scaleX=0.5,
                        scaleY=0.5,
                        skewX=20.0,
                    ),
                    location={"flip": 70.0, "flop": 30.0},
                ),
                Component(
                    name="varcotest2",
                    transformation=DecomposedTransform(
                        translateX=627.0,
                        translateY=-175.0,
                        rotation=10.0,
                        scaleX=0.75,
                        scaleY=0.75,
                        skewY=20.0,
                    ),
                    location={"flip": 20.0, "flop": 80.0},
                ),
            ],
        ),
    ),
]

expandedTestData = [
    (glyphName, location, coordSystem, expectedResult)
    for glyphName, locations, expectedResult in testData
    for location, coordSystem in locations
]


@pytest.mark.parametrize(
    "glyphName, location, coordSystem, expectedResult", expandedTestData
)
async def test_instancer(instancer, glyphName, location, coordSystem, expectedResult):
    glyphInstancer = await instancer.getGlyphInstancer(glyphName)
    instance = glyphInstancer.instantiate(location, coordSystem=coordSystem)
    result = instance.glyph.convertToPaths()
    assert expectedResult == result


penTestData = [
    (
        "period",
        {"weight": 500},
        False,
        False,
        [
            ("beginPath", (), {}),
            ("addPoint", ((45.0, 0.0), "line", False, None), {}),
            ("addPoint", ((165.0, 0.0), "line", False, None), {}),
            ("addPoint", ((165.0, 210.0), "line", False, None), {}),
            ("addPoint", ((45.0, 210.0), "line", False, None), {}),
            ("endPath", (), {}),
        ],
    ),
    (
        "Aacute",
        {},
        False,
        False,
        [
            ("addComponent", ("A", (1, 0, 0, 1, 0, 0)), {}),
            ("addComponent", ("acute", (1, 0, 0, 1, 99, 20)), {}),
        ],
    ),
    (
        "dieresis",
        {},
        False,
        False,
        [
            ("addComponent", ("dot", (1, 0, 0, 1, 0, -10)), {}),
            ("addComponent", ("dot", (1, 0, 0, 1, 80, -10)), {}),
        ],
    ),
    (
        "dieresis",
        {},
        True,
        False,
        [
            ("beginPath", (), {}),
            ("addPoint", ((50.0, 720.0), "line", False, None), {}),
            ("addPoint", ((90.0, 720.0), "line", False, None), {}),
            ("addPoint", ((90.0, 780.0), "line", False, None), {}),
            ("addPoint", ((50.0, 780.0), "line", False, None), {}),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            ("addPoint", ((130.0, 720.0), "line", False, None), {}),
            ("addPoint", ((170.0, 720.0), "line", False, None), {}),
            ("addPoint", ((170.0, 780.0), "line", False, None), {}),
            ("addPoint", ((130.0, 780.0), "line", False, None), {}),
            ("endPath", (), {}),
        ],
    ),
    (
        "dieresis",
        {"weight": 500},
        True,
        False,
        [
            ("beginPath", (), {}),
            ("addPoint", ((50.0, 775.0), "line", False, None), {}),
            ("addPoint", ((165.0, 775.0), "line", False, None), {}),
            ("addPoint", ((165.0, 867.5), "line", False, None), {}),
            ("addPoint", ((50.0, 867.5), "line", False, None), {}),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            ("addPoint", ((205.0, 775.0), "line", False, None), {}),
            ("addPoint", ((320.0, 775.0), "line", False, None), {}),
            ("addPoint", ((320.0, 867.5), "line", False, None), {}),
            ("addPoint", ((205.0, 867.5), "line", False, None), {}),
            ("endPath", (), {}),
        ],
    ),
    (
        "varcotest1",
        {"weight": 500},
        False,
        False,
        [
            (
                "addVarComponent",
                (
                    "A",
                    DecomposedTransform(
                        rotation=-10.0,
                        skewY=20.0,
                        tCenterX=250.0,
                        tCenterY=300.0,
                    ),
                    {"italic": 0, "unknown-axis": 100.0, "weight": 300.0, "width": 0.0},
                ),
                {},
            ),
            (
                "addVarComponent",
                (
                    "varcotest2",
                    DecomposedTransform(
                        translateX=527.0,
                        translateY=410.0,
                        scaleX=0.5,
                        scaleY=0.5,
                        skewX=20.0,
                    ),
                    {
                        "flip": 70.0,
                        "flop": 30.0,
                        "italic": 0,
                        "weight": 500.0,
                        "width": 0.0,
                    },
                ),
                {},
            ),
            (
                "addVarComponent",
                (
                    "varcotest2",
                    DecomposedTransform(
                        translateX=627.0,
                        translateY=-175.0,
                        rotation=10.0,
                        scaleX=0.75,
                        scaleY=0.75,
                        skewY=20.0,
                    ),
                    {
                        "flip": 20.0,
                        "flop": 80.0,
                        "italic": 0,
                        "weight": 500.0,
                        "width": 0.0,
                    },
                ),
                {},
            ),
        ],
    ),
    (
        "varcotest1",
        {"weight": 500},
        True,
        False,
        [
            ("beginPath", (), {}),
            (
                "addPoint",
                ((-49.87408360272606, -39.1325599959878), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((41.45254750580243, -23.029210874345203), "line", False, "test-name"),
                {},
            ),
            (
                "addPoint",
                ((300.87265092867585, 711.0926834687576), "line", False, None),
                {"identifier": "test-identifier"},
            ),
            (
                "addPoint",
                ((220.400414501079, 696.9032569886217), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((49.2048313370356, 125.82806642121722), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((360.6136718382474, 180.7378470327198), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((373.339602572981, 252.91018664632878), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((61.93076207176921, 198.00040603482617), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((296.86768303227717, 22.007368800281462), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((409.4539561365614, 41.85936640597855), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((389.2798241575054, 726.6812533971674), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((285.3022089036152, 708.3471944381826), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((236.09639069942705, 617.269854437116), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((335.4328165035396, 634.7855464735256), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((350.4285769892052, 719.8307302872228), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((251.0921511850927, 702.3150382508131), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            ("addPoint", ((599.4343385942789, 512.85), "line", False, None), {}),
            ("addPoint", ((768.9843385942789, 512.85), "line", False, None), {}),
            ("addPoint", ((793.2999518602035, 546.0), "line", False, None), {}),
            ("addPoint", ((822.5468205418553, 563.85), "line", False, None), {}),
            ("addPoint", ((887.3881177763792, 742.0), "line", False, None), {}),
            ("addPoint", ((749.8381177763792, 742.0), "line", False, None), {}),
            ("addPoint", ((736.0072488742635, 704.0), "line", False, None), {}),
            ("addPoint", ((669.0072488742635, 704.0), "line", False, None), {}),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((664.2881431651941, -84.13611805502723), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((849.2542636761442, 22.65412141293052), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((842.1370128155872, 93.2516018605703), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((884.354439802735, 125.92658104585712), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((822.2578514690408, 478.0938335230227), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((681.5287702432207, 396.84386059448684), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((691.4267163702358, 340.709818672791), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((598.8054153669947, 287.23488560587646), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
        ],
    ),
    (
        "nestedcomponents",
        {"weight": 500},
        True,
        False,
        [
            ("beginPath", (), {}),
            (
                "addPoint",
                ((-52.77408918715182, 124.10449536695283), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((2.02188947796526, 114.44248589396727), "line", False, "test-name"),
                {},
            ),
            (
                "addPoint",
                ((298.9376689130037, 475.11570144436826), "line", False, None),
                {"identifier": "test-identifier"},
            ),
            (
                "addPoint",
                ((250.6543270564456, 483.6293573324498), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((36.94006021365214, 196.77967457268454), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((223.78536451437924, 163.83380620578296), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((245.7710788000935, 201.91418038933298), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((58.92577449936642, 234.86004875623456), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((155.2709707938501, 87.42053808919127), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((222.8227346564206, 75.50933952577302), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((351.9819728503015, 465.7625594873224), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((289.59540369796736, 476.7629948627134), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((243.16222620971098, 435.5098008676184), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((302.7640816921785, 425.00038564577267), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((328.6712245493213, 469.87287335328926), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((269.0693690668538, 480.382288575135), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((426.58960315430653, 302.0749226519696), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((522.1845334668569, 267.2812134714493), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((542.6968355311285, 280.9818419783232), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((562.849711274892, 285.04413901594495), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((635.9667775150534, 372.1816653876062), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((558.4139455215925, 400.4085878162736), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((542.8178269859419, 381.82185752088697), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((505.0421836303484, 395.57106728257884), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((340.6464215090458, -47.82393177752656), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((466.8478484379359, -25.5712152060554), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((477.3224877982471, 15.693289543226811), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((507.8306312017506, 25.452425380683934), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((545.0885842019671, 236.75277686698328), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((449.0698602755021, 219.82208518555004), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((443.1310925992931, 186.14166003253254), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((379.93605818796544, 174.9986704190156), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
        ],
    ),
]


@pytest.mark.parametrize(
    "glyphName, location, decomposeComponents, decomposeVarComponents, expectedResult",
    penTestData,
)
async def test_drawPoints(
    instancer,
    glyphName,
    location,
    decomposeComponents,
    decomposeVarComponents,
    expectedResult,
):
    glyphInstancer = await instancer.getGlyphInstancer(glyphName)
    pen = RecordingPointPen()
    _ = await glyphInstancer.drawPoints(
        pen,
        location,
        decomposeComponents=decomposeComponents,
        decomposeVarComponents=decomposeVarComponents,
    )
    assert expectedResult == pen.value


async def test_anchorInterpolation(instancer):
    glyphInstancer = await instancer.getGlyphInstancer("E")
    _ = glyphInstancer.instantiate({"Weight": 400})


testData_FontSourcesInstancer = [
    (
        {},
        FontSource(
            name="Light",
            location={"Weight": 400, "Width": 50},
            lineMetricsHorizontalLayout={"ascender": LineMetric(value=800)},
            guidelines=[Guideline(name="guide", x=100, y=200, angle=0)],
        ),
    ),
    (
        {"Weight": 400, "Width": 50},
        FontSource(
            name="Light",
            location={"Weight": 400, "Width": 50},
            lineMetricsHorizontalLayout={"ascender": LineMetric(value=800)},
            guidelines=[Guideline(name="guide", x=100, y=200, angle=0)],
        ),
    ),
    (
        {"Weight": 900, "Width": 50},
        FontSource(
            name="Bold",
            location={"Weight": 900, "Width": 50},
            lineMetricsHorizontalLayout={"ascender": LineMetric(value=900)},
            guidelines=[],
        ),
    ),
    (
        {"Weight": 650},
        FontSource(
            name="",
            location={},
            lineMetricsHorizontalLayout={"ascender": LineMetric(value=850)},
            guidelines=[],
        ),
    ),
    (
        {"Width": 75},
        FontSource(
            name="",
            location={},
            lineMetricsHorizontalLayout={"ascender": LineMetric(value=825)},
            guidelines=[],
        ),
    ),
    (
        {"Weight": 650, "Width": 75},
        FontSource(
            name="",
            location={},
            lineMetricsHorizontalLayout={"ascender": LineMetric(value=875)},
            guidelines=[],
        ),
    ),
]

testAxes_FontSourcesInstancer = [
    FontAxis(
        name="Weight",
        label="Weight",
        tag="wght",
        minValue=400,
        defaultValue=400,
        maxValue=900,
    ),
    FontAxis(
        name="Width",
        label="Width",
        tag="wdth",
        minValue=50,
        defaultValue=50,
        maxValue=100,
    ),
]

testSources_FontSourcesInstancer = {
    "source1": FontSource(
        name="Light",
        location={"Weight": 400, "Width": 50},
        lineMetricsHorizontalLayout={"ascender": LineMetric(value=800)},
        guidelines=[Guideline(name="guide", x=100, y=200, angle=0)],
    ),
    "source2": FontSource(
        name="Bold",
        location={"Weight": 900, "Width": 50},
        lineMetricsHorizontalLayout={"ascender": LineMetric(value=900)},
        guidelines=[],
    ),
    "source3": FontSource(
        name="Light Wide",
        location={"Weight": 400, "Width": 100},
        lineMetricsHorizontalLayout={"ascender": LineMetric(value=850)},
        guidelines=[],
    ),
    "source4": FontSource(
        name="Bold Wide",
        location={"Weight": 900, "Width": 100},
        lineMetricsHorizontalLayout={"ascender": LineMetric(value=950)},
        guidelines=[],
    ),
}


@pytest.mark.parametrize("location, expectedSource", testData_FontSourcesInstancer)
def test_FontSourcesInstancer(location, expectedSource):
    fsi = FontSourcesInstancer(
        fontAxes=testAxes_FontSourcesInstancer,
        fontSources=testSources_FontSourcesInstancer,
    )

    sourceInstance = fsi.instantiate(location)
    assert sourceInstance == expectedSource


def test_FontSourcesInstancer_empty_sources_list():
    fsi = FontSourcesInstancer(fontAxes=[], fontSources={})
    sourceInstance = fsi.instantiate({})
    assert sourceInstance is None


testData_prependTransformToDecomposed = [
    (
        Transform(),
        DecomposedTransform(),
        DecomposedTransform(),
    ),
    (
        Transform(),
        DecomposedTransform(rotation=30),
        DecomposedTransform(rotation=30),
    ),
    (
        Transform().rotate((30 * math.pi) / 180),
        DecomposedTransform(rotation=30),
        DecomposedTransform(rotation=60),
    ),
    (
        Transform().rotate((30 * math.pi) / 180),
        DecomposedTransform(rotation=30, tCenterX=50, tCenterY=50),
        DecomposedTransform(
            rotation=60,
            translateX=-31.698729810778058,
            translateY=18.301270189221924,
            tCenterX=50,
            tCenterY=50,
        ),
    ),
]


@pytest.mark.parametrize(
    "prependTransform, decomposed, expectedResult",
    testData_prependTransformToDecomposed,
)
def test_prependTransformToDecomposed(prependTransform, decomposed, expectedResult):
    result = prependTransformToDecomposed(prependTransform, decomposed)
    assert asdict(result) == pytest.approx(asdict(expectedResult))
    assert result.toTransform() == pytest.approx(expectedResult.toTransform())
