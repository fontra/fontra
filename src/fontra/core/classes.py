from __future__ import annotations

import sys
from dataclasses import dataclass, field, is_dataclass, replace
from functools import partial
from typing import Any, Optional, Union, get_args, get_origin, get_type_hints

import cattrs
from fontTools.misc.transform import DecomposedTransform

from .path import PackedPath, Path, Point, PointType


@dataclass(kw_only=True)
class FontInfo:
    familyName: Optional[str] = None
    versionMajor: Optional[int] = None
    versionMinor: Optional[int] = None
    copyright: Optional[str] = None
    trademark: Optional[str] = None
    description: Optional[str] = None
    sampleText: Optional[str] = None
    designer: Optional[str] = None
    designerURL: Optional[str] = None
    manufacturer: Optional[str] = None
    manufacturerURL: Optional[str] = None
    licenseDescription: Optional[str] = None
    licenseInfoURL: Optional[str] = None
    vendorID: Optional[str] = None
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class Axes:
    axes: list[Union[FontAxis, DiscreteFontAxis]] = field(default_factory=list)
    mappings: list[CrossAxisMapping] = field(default_factory=list)
    elidedFallBackname: Optional[str] = None
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class CrossAxisMapping:
    description: Optional[str] = None
    groupDescription: Optional[str] = None
    inputLocation: Location
    outputLocation: Location


@dataclass(kw_only=True)
class SingleAxisMapping:
    inputUserValue: float
    outputUserValue: float


@dataclass(kw_only=True)
class OpenTypeFeatures:
    language: str = "fea"
    text: str = ""
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class Kerning:
    groups: dict[str, list[str]]
    sourceIdentifiers: list[str]
    # left glyph/group -> right glyph/group -> source index -> value
    values: dict[str, dict[str, list[float | None]]]


@dataclass(kw_only=True)
class Font:
    unitsPerEm: int = 1000
    fontInfo: FontInfo = field(default_factory=FontInfo)
    glyphs: dict[str, VariableGlyph] = field(default_factory=dict)
    glyphMap: dict[str, list[int]] = field(default_factory=dict)
    axes: Axes = field(default_factory=Axes)
    sources: dict[str, FontSource] = field(default_factory=dict)
    kerning: dict[str, Kerning] = field(default_factory=dict)
    features: OpenTypeFeatures = field(default_factory=OpenTypeFeatures)
    customData: CustomData = field(default_factory=dict)

    def _trackAssignedAttributeNames(self):
        # see fonthandler.py
        self._assignedAttributeNames = set()

    def __setattr__(self, attrName, value):
        if hasattr(self, "_assignedAttributeNames"):
            self._assignedAttributeNames.add(attrName)
        super().__setattr__(attrName, value)


@dataclass(kw_only=True)
class FontSource:
    name: str
    isSparse: bool = False
    location: Location = field(default_factory=dict)
    lineMetricsHorizontalLayout: dict[str, LineMetric] = field(default_factory=dict)
    lineMetricsVerticalLayout: dict[str, LineMetric] = field(default_factory=dict)
    italicAngle: float = 0
    guidelines: list[Guideline] = field(default_factory=list)
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class LineMetric:
    value: float
    zone: float = 0
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class Guideline:
    name: Optional[str] = None
    x: float = 0
    y: float = 0
    angle: float = 0
    locked: bool = False
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class AxisValueLabel:
    name: str
    value: float
    minValue: Optional[float] = None
    maxValue: Optional[float] = None
    linkedValue: Optional[float] = None
    elidable: bool = False
    olderSibling: bool = False


@dataclass(kw_only=True)
class FontAxis:
    name: str  # this identifies the axis
    label: str  # a user friendly label
    tag: str  # the opentype 4-char tag
    minValue: float
    defaultValue: float
    maxValue: float
    mapping: list[list[float]] = field(default_factory=list)
    valueLabels: list[AxisValueLabel] = field(default_factory=list)
    hidden: bool = False
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class DiscreteFontAxis:
    name: str  # this identifies the axis
    label: str  # a user friendly label
    tag: str  # the opentype 4-char tag
    values: list[float]
    defaultValue: float
    mapping: list[list[float]] = field(default_factory=list)
    valueLabels: list[AxisValueLabel] = field(default_factory=list)
    hidden: bool = False
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class GlyphAxis:
    name: str
    minValue: float
    defaultValue: float
    maxValue: float
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class VariableGlyph:
    name: str
    axes: list[GlyphAxis] = field(default_factory=list)
    sources: list[GlyphSource] = field(default_factory=list)
    layers: dict[str, Layer] = field(default_factory=dict)
    customData: CustomData = field(default_factory=dict)

    def convertToPackedPaths(self):
        return _convertToPathType(self, True)

    def convertToPaths(self):
        return _convertToPathType(self, False)


@dataclass(kw_only=True)
class GlyphSource:
    name: str
    layerName: str
    location: Location = field(default_factory=dict)
    locationBase: Optional[str] = None
    inactive: bool = False
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class Layer:
    glyph: StaticGlyph
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class StaticGlyph:
    path: Union[PackedPath, Path] = field(default_factory=PackedPath)
    components: list[Component] = field(default_factory=list)
    xAdvance: Optional[float] = None
    yAdvance: Optional[float] = None
    verticalOrigin: Optional[float] = None
    anchors: list[Anchor] = field(default_factory=list)
    guidelines: list[Guideline] = field(default_factory=list)
    image: Optional[Image] = None

    def convertToPackedPaths(self):
        return replace(self, path=self.path.asPackedPath())

    def convertToPaths(self):
        return replace(self, path=self.path.asPath())


@dataclass(kw_only=True)
class Component:
    name: str
    transformation: DecomposedTransform = field(default_factory=DecomposedTransform)
    location: Location = field(default_factory=dict)


@dataclass(kw_only=True)
class Anchor:
    name: Optional[str]
    x: float
    y: float
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class Image:
    fileName: str
    xScale: Optional[float] = 1
    xyScale: Optional[float] = 0
    yxScale: Optional[float] = 0
    yScale: Optional[float] = 1
    xOffset: Optional[float] = 0
    yOffset: Optional[float] = 0
    # transformation: DecomposedTransform = field(default_factory=DecomposedTransform)
    color: Optional[str] = None
    customData: CustomData = field(default_factory=dict)


Location = dict[str, float]
CustomData = dict[str, Any]


def _convertToPathType(varGlyph, packedPath):
    if not _hasAnyPathType(varGlyph, Path if packedPath else PackedPath):
        return varGlyph
    converter = (
        (lambda glyph: glyph.convertToPackedPaths())
        if packedPath
        else (lambda glyph: glyph.convertToPaths())
    )

    return replace(
        varGlyph,
        layers={
            k: replace(v, glyph=converter(v.glyph)) for k, v in varGlyph.layers.items()
        },
    )


def _hasAnyPathType(varGlyph, pathType):
    return any(
        isinstance(layer.glyph.path, pathType) for layer in varGlyph.layers.values()
    )


def makeSchema(*classes, schema=None):
    if schema is None:
        schema = {}
    for cls in classes:
        if cls in schema:
            continue
        cls_globals = vars(sys.modules[cls.__module__])
        classFields = {}
        schema[cls] = classFields
        for name, tp in get_type_hints(cls, cls_globals).items():
            fieldDef = dict(type=tp)
            if is_dataclass(tp):
                makeSchema(tp, schema=schema)
            elif tp.__name__ == "Optional":
                [subtype, _] = get_args(tp)
                fieldDef["type"] = subtype
                fieldDef["optional"] = True
                if is_dataclass(subtype):
                    makeSchema(subtype, schema=schema)
            elif tp.__name__ == "list":
                [subtype] = get_args(tp)
                if get_origin(subtype) == Union:
                    for sub in get_args(subtype):
                        makeSchema(sub, schema=schema)
                fieldDef["subtype"] = subtype
                if is_dataclass(subtype):
                    makeSchema(subtype, schema=schema)
            elif tp.__name__ == "dict":
                args = get_args(tp)
                if not args:
                    continue
                [keytype, subtype] = args
                assert keytype == str
                fieldDef["subtype"] = subtype
                if is_dataclass(subtype):
                    makeSchema(subtype, schema=schema)
            elif tp.__name__ == "Union":
                tp = get_args(tp)[0]  # just take the first for now
                fieldDef = dict(type=tp)
                makeSchema(tp, schema=schema)
            classFields[name] = fieldDef
    return schema


# cattrs hooks + structure/unstructure support


def _unstructureFloat(v):
    try:
        if v.is_integer():
            return int(v)
    except AttributeError:
        pass
    return v


def _structurePath(d, tp):
    if "pointTypes" not in d:
        return structure(d, Path)
    else:
        return structure(d, PackedPath)


def _structureGlobalAxis(d, tp):
    if "values" not in d:
        return structure(d, FontAxis)
    else:
        return structure(d, DiscreteFontAxis)


def _structureNumber(d, tp):
    assert isinstance(d, (float, int))
    return d


def _structurePoint(d, tp):
    return {**d, "x": _unstructureFloat(d["x"]), "y": _unstructureFloat(d["y"])}


def _unstructurePoint(v):
    return v


def _structurePointType(v, tp):
    return PointType(v)


def _unstructurePointType(v):
    return int(v)


def _structureAxes(v, tp):
    if isinstance(v, list):
        # old format
        v = {"axes": v}

    fieldTypes = get_type_hints(tp)
    return Axes(**{n: structure(vv, fieldTypes[n]) for n, vv in v.items()})


def _unstructureDictSorted(v):
    return unstructure(dict(sorted(v.items())))


def _unstructureDictSortedRecursively(v):
    if isinstance(v, dict):
        return unstructure(
            dict(
                sorted((k, _unstructureDictSortedRecursively(v)) for k, v in v.items())
            )
        )
    elif isinstance(v, list):
        return [_unstructureDictSortedRecursively(item) for item in v]
    return v


_cattrsConverter = cattrs.Converter()

_cattrsConverter.register_unstructure_hook(float, _unstructureFloat)
_cattrsConverter.register_structure_hook(Union[PackedPath, Path], _structurePath)
_cattrsConverter.register_structure_hook(
    Union[FontAxis, DiscreteFontAxis], _structureGlobalAxis
)
_cattrsConverter.register_structure_hook(float, _structureNumber)
_cattrsConverter.register_structure_hook(Point, _structurePoint)
_cattrsConverter.register_unstructure_hook(Point, _unstructurePoint)
_cattrsConverter.register_structure_hook(bool, lambda x, y: x)
_cattrsConverter.register_structure_hook(PointType, _structurePointType)
_cattrsConverter.register_unstructure_hook(PointType, _unstructurePointType)
_cattrsConverter.register_structure_hook(Axes, _structureAxes)


def registerHook(cls, omitIfDefault=True, **fieldHooks):
    fieldHooks = {
        k: cattrs.gen.override(unstruct_hook=v) for k, v in fieldHooks.items()
    }
    _hook = cattrs.gen.make_dict_unstructure_fn(
        cls,
        _cattrsConverter,
        _cattrs_omit_if_default=omitIfDefault,
        **fieldHooks,
    )
    _cattrsConverter.register_unstructure_hook(cls, _hook)


# The order in which the hooks are registered is significant, for unclear reasons
registerHook(DecomposedTransform)
registerHook(
    Component,
    location=_unstructureDictSorted,
    customData=_unstructureDictSortedRecursively,
)
registerHook(GlyphAxis, customData=_unstructureDictSortedRecursively)
registerHook(Anchor, customData=_unstructureDictSortedRecursively)
registerHook(Guideline, customData=_unstructureDictSortedRecursively)
registerHook(Image, customData=_unstructureDictSortedRecursively)
registerHook(StaticGlyph, customData=_unstructureDictSortedRecursively)
registerHook(
    GlyphSource,
    location=_unstructureDictSorted,
    customData=_unstructureDictSortedRecursively,
)
registerHook(Layer, customData=_unstructureDictSortedRecursively)
registerHook(
    VariableGlyph,
    layers=_unstructureDictSorted,
    customData=_unstructureDictSortedRecursively,
)
registerHook(Path)
registerHook(PackedPath)
registerHook(AxisValueLabel)
registerHook(LineMetric, customData=_unstructureDictSortedRecursively)
registerHook(
    FontSource,
    location=_unstructureDictSorted,
    metricsHorizontalLayout=_unstructureDictSorted,
    metricsVerticalLayout=_unstructureDictSorted,
    customData=_unstructureDictSortedRecursively,
)
registerHook(FontAxis, customData=_unstructureDictSortedRecursively)
registerHook(DiscreteFontAxis, customData=_unstructureDictSortedRecursively)
registerHook(FontInfo, customData=_unstructureDictSortedRecursively)
registerHook(Axes, customData=_unstructureDictSortedRecursively)
registerHook(OpenTypeFeatures, customData=_unstructureDictSortedRecursively)
registerHook(
    Font,
    sources=_unstructureDictSorted,
    customData=_unstructureDictSortedRecursively,
)


def structure(obj, cls):
    return _cattrsConverter.structure(obj, cls)


def unstructure(obj):
    return _cattrsConverter.unstructure(obj)


atomicTypes = [str, int, float, bool, Any]


def makeCastFuncs(schema):
    castFuncs = {}

    for cls, fields in schema.items():
        castFuncs[cls] = partial(structure, cls=cls)
        for fieldName, fieldInfo in fields.items():
            fieldType = fieldInfo["type"]
            if fieldType not in atomicTypes and fieldType not in schema:
                itemType = get_args(fieldType)[-1]
                if itemType not in atomicTypes:
                    castFuncs[fieldType] = partial(structure, cls=fieldType)
            subType = fieldInfo.get("subtype")
            if subType not in atomicTypes and subType not in schema:
                castFuncs[subType] = partial(structure, cls=subType)

    return castFuncs


def classesToStrings(schema):
    return {
        cls.__name__: {
            fieldName: {k: classToString(v) for k, v in fieldDef.items()}
            for fieldName, fieldDef in classFields.items()
        }
        for cls, classFields in schema.items()
    }


def classToString(cls):
    if get_origin(cls) == Union:
        cls = get_args(cls)[0]  # take the first; for now that's good enough
    return cls.__name__ if hasattr(cls, "__name__") else cls


classSchema = makeSchema(Font)
classCastFuncs = makeCastFuncs(classSchema)


def serializableClassSchema():
    return classesToStrings(classSchema)


def printSchemaAsJSON():
    import json

    schema = serializableClassSchema()
    print(json.dumps(schema, indent=2))


if __name__ == "__main__":
    printSchemaAsJSON()
