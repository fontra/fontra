from __future__ import annotations

import os
import pathlib
import re
from contextlib import AsyncExitStack, asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from functools import singledispatch
from importlib.metadata import entry_points
from typing import Any, AsyncGenerator, Protocol

from ..backends.null import NullBackend
from ..core.protocols import ReadableFontBackend
from .actions import (
    FilterActionProtocol,
    InputActionProtocol,
    OutputActionProtocol,
    OutputProcessorProtocol,
    getActionClass,
)
from .merger import FontBackendMerger


class WorkflowError(Exception):
    pass


@dataclass(kw_only=True)
class Workflow:
    config: dict
    parentDir: os.PathLike = field(default_factory=pathlib.Path)
    substitutions: dict[str, Any] = field(default_factory=dict)
    steps: list[ActionStep] = field(init=False)

    def __post_init__(self) -> None:
        if self.substitutions:
            self.config = substituteStrings(self.config, self.substitutions)
        self.steps = _structureSteps(self.config["steps"])
        _loadActionsEntryPoints()

    @asynccontextmanager
    async def endPoints(
        self, input: ReadableFontBackend | None = None
    ) -> AsyncGenerator[WorkflowEndPoints, None]:
        if input is None:
            input = NullBackend()
        async with AsyncExitStack() as exitStack:
            with chdir(self.parentDir):
                endPoints = await _prepareEndPoints(input, self.steps, exitStack)
            yield endPoints


@dataclass(frozen=True)
class WorkflowEndPoints:
    endPoint: ReadableFontBackend
    outputs: list[OutputProcessorProtocol]


class ActionStep(Protocol):
    async def setup(
        self, currentInput: ReadableFontBackend, exitStack
    ) -> WorkflowEndPoints:
        pass


def getAction(
    actionType,
    actionName,
    actionArguments,
) -> InputActionProtocol | FilterActionProtocol | OutputActionProtocol:
    actionClass = getActionClass(actionType, actionName)
    action = actionClass(**actionArguments)
    assert isinstance(
        action, (InputActionProtocol, FilterActionProtocol, OutputActionProtocol)
    )
    return action


_actionStepClasses: dict[str, type] = {}


def registerActionStepClass(actionType):
    def register(cls):
        assert actionType not in _actionStepClasses
        _actionStepClasses[actionType] = cls
        return cls

    return register


@registerActionStepClass("input")
@dataclass(kw_only=True)
class InputActionStep:
    actionName: str
    arguments: dict
    steps: list[ActionStep] = field(default_factory=list)

    async def setup(
        self, currentInput: ReadableFontBackend, exitStack
    ) -> WorkflowEndPoints:
        action = getAction("input", self.actionName, self.arguments)
        assert isinstance(action, InputActionProtocol)

        backend = await exitStack.enter_async_context(action.prepare())
        assert isinstance(backend, ReadableFontBackend)

        # set up nested steps
        endPoints = await _prepareEndPoints(backend, self.steps, exitStack)

        endPoint = FontBackendMerger(inputA=currentInput, inputB=endPoints.endPoint)
        return WorkflowEndPoints(endPoint=endPoint, outputs=endPoints.outputs)


@registerActionStepClass("filter")
@dataclass(kw_only=True)
class FilterActionStep:
    actionName: str
    arguments: dict
    steps: list[ActionStep] = field(default_factory=list)

    async def setup(
        self, currentInput: ReadableFontBackend, exitStack
    ) -> WorkflowEndPoints:
        action = getAction("filter", self.actionName, self.arguments)
        assert isinstance(action, FilterActionProtocol)

        backend = await exitStack.enter_async_context(action.connect(currentInput))

        # set up nested steps
        return await _prepareEndPoints(backend, self.steps, exitStack)


@registerActionStepClass("output")
@dataclass(kw_only=True)
class OutputActionStep:
    actionName: str
    arguments: dict
    steps: list[ActionStep] = field(default_factory=list)

    async def setup(
        self, currentInput: ReadableFontBackend, exitStack
    ) -> WorkflowEndPoints:
        assert currentInput is not None
        action = getAction("output", self.actionName, self.arguments)
        assert isinstance(action, OutputActionProtocol)

        outputs = []

        # set up nested steps
        endPoints = await _prepareEndPoints(currentInput, self.steps, exitStack)
        outputs.extend(endPoints.outputs)

        assert isinstance(endPoints.endPoint, ReadableFontBackend)
        processor = await exitStack.enter_async_context(
            action.connect(endPoints.endPoint)
        )
        assert isinstance(processor, OutputProcessorProtocol)
        outputs.append(processor)

        return WorkflowEndPoints(endPoint=currentInput, outputs=outputs)


@registerActionStepClass("fork")
@dataclass(kw_only=True)
class ForkActionStep:
    actionName: str
    arguments: dict
    steps: list[ActionStep] = field(default_factory=list)

    def __post_init__(self):
        if self.actionName:
            raise WorkflowError(
                "fork 'value' needs to be empty; use 'fork:', "
                + "instead of 'fork: <something>'"
            )
        if self.arguments:
            raise WorkflowError("fork does not expect arguments")

    async def setup(
        self, currentInput: ReadableFontBackend, exitStack
    ) -> WorkflowEndPoints:
        # set up nested steps
        endPoints = await _prepareEndPoints(currentInput, self.steps, exitStack)
        return WorkflowEndPoints(endPoint=currentInput, outputs=endPoints.outputs)


@registerActionStepClass("fork-merge")
@dataclass(kw_only=True)
class ForkMergeActionStep:
    actionName: str
    arguments: dict
    steps: list[ActionStep] = field(default_factory=list)

    def __post_init__(self):
        if self.actionName:
            raise WorkflowError(
                "fork-merge 'value' needs to be empty; use 'fork-merge:', "
                + "instead of 'fork-merge: <something>'"
            )
        if self.arguments:
            raise WorkflowError("fork-merge does not expect arguments")

    async def setup(
        self, currentInput: ReadableFontBackend, exitStack
    ) -> WorkflowEndPoints:
        # set up nested steps
        endPoints = await _prepareEndPoints(currentInput, self.steps, exitStack)

        endPoint = FontBackendMerger(
            inputA=currentInput, inputB=endPoints.endPoint, warnAboutDuplicates=False
        )
        return WorkflowEndPoints(endPoint=endPoint, outputs=endPoints.outputs)


MISSING_ACTION_TYPE = object()


def _structureSteps(rawSteps) -> list[ActionStep]:
    structured = []

    for rawStep in rawSteps:
        actionName = None
        for actionType in _actionStepClasses:
            actionName = rawStep.get(actionType, MISSING_ACTION_TYPE)
            if actionName is MISSING_ACTION_TYPE:
                continue
            break
        if actionName is MISSING_ACTION_TYPE:
            raise WorkflowError("no action type keyword found in step")
        arguments = dict(rawStep)
        del arguments[actionType]
        subSteps = _structureSteps(arguments.pop("steps", []))
        structured.append(
            _actionStepClasses[actionType](
                actionName=actionName,
                arguments=arguments,
                steps=subSteps,
            )
        )

    return structured


async def _prepareEndPoints(
    currentInput: ReadableFontBackend,
    steps: list[ActionStep],
    exitStack: AsyncExitStack,
) -> WorkflowEndPoints:
    outputs: list[OutputProcessorProtocol] = []

    for step in steps:
        endPoints = await step.setup(currentInput, exitStack)
        currentInput = endPoints.endPoint
        outputs.extend(endPoints.outputs)

    return WorkflowEndPoints(currentInput, outputs)


def _loadActionsEntryPoints():
    from .actions import axes  # noqa: F401
    from .actions import base  # noqa: F401
    from .actions import features  # noqa: F401
    from .actions import glyph  # noqa: F401
    from .actions import misc  # noqa: F401
    from .actions import subset  # noqa: F401

    for entryPoint in entry_points(group="fontra.workflow.actions"):
        _ = entryPoint.load()


@contextmanager
def chdir(path):
    # contextlib.chdir() requires Python >= 3.11
    currentDir = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(currentDir)


def substituteStrings(config: dict, substitutions: dict[str, Any]) -> dict:
    return _subst(config, _FormatMapper(substitutions))


class _FormatMapper:
    def __init__(self, mapping):
        self.mapping = mapping

    def __getitem__(self, key):
        key = key.strip()
        return self.mapping[key]


@singledispatch
def _subst(subject, mapper):
    return subject


_singleKeyPat = re.compile(r"{\s*([^{]*)\s*}$")


@_subst.register
def _(subject: str, mapper):
    m = _singleKeyPat.match(subject)
    return mapper[m.group(1)] if m is not None else subject.format_map(mapper)


@_subst.register
def _(subject: dict, mapper):
    return {k: _subst(v, mapper) for k, v in subject.items()}


@_subst.register
def _(subject: list, mapper):
    return [_subst(v, mapper) for v in subject]
