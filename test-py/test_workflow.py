import logging
import pathlib
import shutil
import subprocess

import pytest
import yaml
from fontTools.misc.arrayTools import scaleRect
from testSupport import directoryTreeToList

from fontra.backends import getFileSystemBackend
from fontra.core.path import PackedPath
from fontra.core.protocols import ReadableFontBackend
from fontra.workflow.actions import FilterActionProtocol, getActionClass
from fontra.workflow.actions import glyph as _  # noqa  for test_scaleAction
from fontra.workflow.workflow import Workflow, substituteStrings

dataDir = pathlib.Path(__file__).resolve().parent / "data"
workflowDataDir = dataDir / "workflow"
workflowSourcesDir = dataDir / "workflow-sources"
commonFontsDir = pathlib.Path(__file__).parent.parent / "test-common" / "fonts"


@pytest.fixture
def testFontraFont():
    return getFileSystemBackend(commonFontsDir / "MutatorSans.fontra")


@pytest.mark.parametrize("glyphName", ["A", "E", "Q", "Adieresis", "period"])
async def test_scaleAction(testFontraFont, glyphName) -> None:
    scaleFactor = 2

    unscaledGlyph = await testFontraFont.getGlyph(glyphName)
    actionClass = getActionClass("filter", "scale")
    action = actionClass(scaleFactor=scaleFactor)
    assert isinstance(action, FilterActionProtocol)
    assert isinstance(action, ReadableFontBackend)

    async with action.connect(testFontraFont) as action:
        scaledGlyph = await action.getGlyph(glyphName)
        assert scaledGlyph is not None

        assert (
            await testFontraFont.getUnitsPerEm() * scaleFactor
            == await action.getUnitsPerEm()
        )

        for unscaledLayer, scaledLayer in zip(
            unscaledGlyph.layers.values(), scaledGlyph.layers.values()
        ):
            unscaledLayerGlyph = unscaledLayer.glyph
            scaledLayerGlyph = scaledLayer.glyph
            assert (
                unscaledLayerGlyph.xAdvance * scaleFactor == scaledLayerGlyph.xAdvance
            )

            unscaledBounds = unscaledLayerGlyph.path.getControlBounds()
            assert isinstance(scaledLayerGlyph.path, PackedPath)
            scaledBounds = scaledLayerGlyph.path.getControlBounds()
            if unscaledBounds is None:
                assert scaledBounds is None
            else:
                assert (
                    scaleRect(unscaledBounds, scaleFactor, scaleFactor) == scaledBounds
                )

            for unscaledComponent, scaledComponent in zip(
                unscaledLayerGlyph.components, scaledLayerGlyph.components
            ):
                assert (
                    unscaledComponent.transformation.translateX * scaleFactor
                    == scaledComponent.transformation.translateX
                )

            for unscaledAnchor, scaledAnchor in zip(
                unscaledLayerGlyph.anchors, scaledLayerGlyph.anchors
            ):
                assert unscaledAnchor.x * scaleFactor == scaledAnchor.x
                assert unscaledAnchor.y * scaleFactor == scaledAnchor.y
                assert unscaledAnchor.name == scaledAnchor.name

            for unscaledGuideline, scaledGuideline in zip(
                unscaledLayerGlyph.guidelines, scaledLayerGlyph.guidelines
            ):
                assert unscaledGuideline.x * scaleFactor == scaledGuideline.x
                assert unscaledGuideline.y * scaleFactor == scaledGuideline.y
                assert unscaledGuideline.name == scaledGuideline.name
                assert unscaledGuideline.angle == scaledGuideline.angle


async def test_subsetAction(testFontraFont, tmp_path) -> None:
    glyphNames = {"A"}

    glyphNamesFile = pathlib.Path(tmp_path) / "subset-glyphs.txt"
    glyphNamesFile.write_text("B\nC Adieresis\n")

    actionClass = getActionClass("filter", "subset-glyphs")
    action = actionClass(glyphNames=glyphNames, glyphNamesFile=glyphNamesFile)
    assert isinstance(action, FilterActionProtocol)
    assert isinstance(action, ReadableFontBackend)

    expectedGlyphMap = {
        "A": [
            65,
            97,
        ],
        "Adieresis": [
            196,
            228,
        ],
        "B": [
            66,
            98,
        ],
        "C": [
            67,
            99,
        ],
        "dieresis": [
            168,
        ],
        "dot": [
            10193,
        ],
    }

    async with action.connect(testFontraFont) as action:
        glyphMap = await action.getGlyphMap()

    assert expectedGlyphMap == glyphMap


@pytest.mark.parametrize(
    "configYAMLSources, substitutions",
    [
        (
            [
                """
                    steps:

                    - input: fontra-read
                      source: "test-py/data/mutatorsans/MutatorSans.designspace"
                      steps:
                      - filter: scale
                        scaleFactor: 0.75
                        scaleFontMetrics: false
                      - filter: subset-glyphs
                        glyphNames: ["A", "B", "Adieresis"]

                    - input: fontra-read
                      source: "test-common/fonts/MutatorSans.fontra"
                      steps:
                      - filter: subset-glyphs
                        glyphNames: ["C", "D"]

                    - output: fontra-write
                      destination: "testing.fontra"
                    """
            ],
            {},
        ),
        (
            [
                """
                    steps:

                    - input: fontra-read
                      source: "test-py/data/mutatorsans/Mutator{style}.designspace"
                      steps:
                      - filter: "{filtername}"
                        scaleFactor: "{scalefactor}"
                        scaleFontMetrics: false
                      - filter: subset-glyphs
                        glyphNames: ["A", "B", "Adieresis"]

                    - input: fontra-read
                      source: "test-common/fonts/MutatorSans.fontra"
                      steps:
                      - filter: subset-glyphs
                        glyphNames: ["C", "D"]
                    """,
                """
                    steps:

                    - output: fontra-write
                      destination: "testing.fontra"
                    """,
            ],
            {"style": "Sans", "filtername": "scale", "scalefactor": 0.75},
        ),
    ],
)
def test_command(tmpdir, configYAMLSources, substitutions):
    tmpdir = pathlib.Path(tmpdir)

    configs = [yaml.safe_load(source) for source in configYAMLSources]
    configPaths = []
    for index, config in enumerate(configs):
        for step in config["steps"]:
            if "source" in step:
                step["source"] = str(pathlib.Path(step["source"]).resolve())
        configPath = pathlib.Path(tmpdir) / f"config_{index}.yaml"
        configPath.write_text(yaml.dump(config))
        configPaths.append(configPath)

    expectedFileNames = [p.name for p in configPaths]

    substitutions = [f"--substitute={k}:{v}" for k, v in substitutions.items()]

    subprocess.run(
        [
            "fontra-workflow",
            *configPaths,
            "--output-dir",
            tmpdir,
            *substitutions,
            "--continue-on-error",
        ],
        check=True,
    )
    items = sorted([p.name for p in tmpdir.iterdir()])
    assert [*expectedFileNames, "testing.fontra"] == items


workflowTests = [
    (path.stem, path) for path in sorted(workflowSourcesDir.glob("*.yaml"))
]


@pytest.mark.parametrize("testName, workflowTestPath", workflowTests)
async def test_workflow_actions(
    testName,
    workflowTestPath,
    tmpdir,
    caplog,
    writeExpectedData,
):
    caplog.set_level(logging.WARNING)
    tmpdir = pathlib.Path(tmpdir)
    config = yaml.safe_load(workflowTestPath.read_text())
    testInfo = config.get("test-info", {})
    continueOnError = testInfo.get("continue-on-error", False)
    expectedLog = [
        (item["level"], item["message"]) for item in testInfo.get("expected-log", [])
    ]

    workflow = Workflow(config=config, parentDir=pathlib.Path())

    async with workflow.endPoints() as endPoints:
        assert endPoints.endPoint is not None

        for output in endPoints.outputs:
            await output.process(tmpdir, continueOnError=continueOnError)
            expectedPath = workflowDataDir / output.destination
            resultPath = tmpdir / output.destination

            if writeExpectedData:
                print("WARNING: force write of expected data: --write-expected-data")
                if expectedPath.exists():
                    shutil.rmtree(expectedPath)
                shutil.copytree(resultPath, expectedPath)

            if expectedPath.is_file():
                raise NotImplementedError("file comparison to be implemented")
            elif expectedPath.is_dir():
                expectedLines = directoryTreeToList(expectedPath)
                resultLines = directoryTreeToList(resultPath)
                assert expectedLines == resultLines, resultPath
            else:
                assert False, resultPath

    record_tuples = [(rec.levelno, rec.message) for rec in caplog.records]
    assert expectedLog == record_tuples


@pytest.mark.parametrize(
    "sourceDict, substitutions, expectedDict",
    [
        ({}, {}, {}),
        ({"a": "aaa{key}ccc"}, {"key": "xxx"}, {"a": "aaaxxxccc"}),
        ({"a": ["aaa{ key }ccc"]}, {"key": "xxx"}, {"a": ["aaaxxxccc"]}),
        ({"a": {"z": ["aaa{ key }ccc"]}}, {"key": "xxx"}, {"a": {"z": ["aaaxxxccc"]}}),
        ({"a": "{key}"}, {"key": 123}, {"a": 123}),
    ],
)
def test_substituteStrings(sourceDict, substitutions, expectedDict):
    d = substituteStrings(sourceDict, substitutions)
    assert d == expectedDict


def test_legacy_kern_data():
    # Test that the input file indeed uses the legacy kerning.csv format
    kerningPath = (
        workflowDataDir / "input-upconvert-legacy-kerning.fontra" / "kerning.csv"
    )
    csvData = kerningPath.read_text()
    assert "GROUPS" in csvData
    assert "GROUPS1" not in csvData
    assert "GROUPS2" not in csvData
