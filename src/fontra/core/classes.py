from __future__ import annotations

import sys
from dataclasses import dataclass, field, is_dataclass, replace
from functools import partial
from typing import Any, Optional, Union, get_args, get_origin, get_type_hints

import cattrs
from fontTools.misc.transform import DecomposedTransform

from .path import PackedPath, Path, Point, PointType


@dataclass(kw_only=True)
class Font:
    unitsPerEm: int = 1000
    glyphs: dict[str, VariableGlyph] = field(default_factory=dict)
    glyphMap: dict[str, list[int]] = field(default_factory=dict)
    customData: CustomData = field(default_factory=dict)
    axes: list[Union[GlobalAxis, GlobalDiscreteAxis]] = field(default_factory=list)
    sources: list[GlobalSource] = field(default_factory=list)

    def _trackAssignedAttributeNames(self):
        # see fonthandler.py
        self._assignedAttributeNames = set()

    def __setattr__(self, attrName, value):
        if hasattr(self, "_assignedAttributeNames"):
            self._assignedAttributeNames.add(attrName)
        super().__setattr__(attrName, value)


@dataclass(kw_only=True)
class GlobalSource:
    name: str
    location: Location = field(default_factory=dict)
    verticalMetrics: dict[str, GlobalMetric] = field(default_factory=dict)
    guidelines: list[Union[Guideline, HorizontalGuideline, VerticalGuideline]] = field(
        default_factory=list
    )
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class GlobalMetric:
    value: float
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class Guideline:
    name: Optional[str]
    x: float
    y: float
    angle: float
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class HorizontalGuideline:
    name: Optional[str]
    y: float
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class VerticalGuideline:
    name: Optional[str]
    x: float
    customData: CustomData = field(default_factory=dict)


@dataclass(kw_only=True)
class AxisValueLabel:
    name: str
    value: float
    minValue: Optional[float] = None
    maxValue: Optional[float] = None
    linkedValue: Optional[float] = None
    elidable: bool = False
    oldersibling: bool = False


@dataclass(kw_only=True)
class GlobalAxis:
    name: str  # this identifies the axis
    label: str  # a user friendly label
    tag: str  # the opentype 4-char tag
    minValue: float
    defaultValue: float
    maxValue: float
    mapping: list[list[float]] = field(default_factory=list)
    valueLabels: list[AxisValueLabel] = field(default_factory=list)
    hidden: bool = False


@dataclass(kw_only=True)
class GlobalDiscreteAxis:
    name: str  # this identifies the axis
    label: str  # a user friendly label
    tag: str  # the opentype 4-char tag
    values: list[float]
    defaultValue: float
    mapping: list[list[float]] = field(default_factory=list)
    valueLabels: list[AxisValueLabel] = field(default_factory=list)
    hidden: bool = False


@dataclass(kw_only=True)
class LocalAxis:
    name: str
    minValue: float
    defaultValue: float
    maxValue: float


@dataclass(kw_only=True)
class VariableGlyph:
    name: str
    axes: list[LocalAxis] = field(default_factory=list)
    sources: list[Source] = field(default_factory=list)
    layers: dict[str, Layer] = field(default_factory=dict)
    customData: CustomData = field(default_factory=dict)

    def convertToPackedPaths(self):
        return _convertToPathType(self, True)

    def convertToPaths(self):
        return _convertToPathType(self, False)


@dataclass(kw_only=True)
class Source:
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
    guidelines: list[Union[Guideline, HorizontalGuideline, VerticalGuideline]] = field(
        default_factory=list
    )

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
    name: str
    x: float
    y: float
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


def _structurePath(d, tp):
    if "pointTypes" not in d:
        return structure(d, Path)
    else:
        return structure(d, PackedPath)


def _structureGlobalAxis(d, tp):
    if "values" not in d:
        return structure(d, GlobalAxis)
    else:
        return structure(d, GlobalDiscreteAxis)


def _structureNumber(d, tp):
    assert isinstance(d, (float, int))
    return d


def _structurePoint(d, tp):
    return d


def _unstructurePoint(v):
    return v


def _structurePointType(v, tp):
    return PointType(v)


def _unstructurePointType(v):
    return int(v)


_cattrsConverter = cattrs.Converter()

_cattrsConverter.register_structure_hook(Union[PackedPath, Path], _structurePath)
_cattrsConverter.register_structure_hook(
    Union[GlobalAxis, GlobalDiscreteAxis], _structureGlobalAxis
)
_cattrsConverter.register_structure_hook(float, _structureNumber)
_cattrsConverter.register_structure_hook(Point, _structurePoint)
_cattrsConverter.register_unstructure_hook(Point, _unstructurePoint)
_cattrsConverter.register_structure_hook(bool, lambda x, y: x)
_cattrsConverter.register_structure_hook(PointType, _structurePointType)
_cattrsConverter.register_unstructure_hook(PointType, _unstructurePointType)


def registerOmitDefaultHook(cls):
    _hook = cattrs.gen.make_dict_unstructure_fn(
        cls,
        _cattrsConverter,
        _cattrs_omit_if_default=True,
    )
    _cattrsConverter.register_unstructure_hook(cls, _hook)


# The order in which the hooks are applied is significant, for unclear reasons
registerOmitDefaultHook(DecomposedTransform)
registerOmitDefaultHook(Component)
registerOmitDefaultHook(StaticGlyph)
registerOmitDefaultHook(Source)
registerOmitDefaultHook(Layer)
registerOmitDefaultHook(VariableGlyph)
registerOmitDefaultHook(Path)
registerOmitDefaultHook(PackedPath)
registerOmitDefaultHook(GlobalAxis)
registerOmitDefaultHook(GlobalDiscreteAxis)
registerOmitDefaultHook(AxisValueLabel)


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
