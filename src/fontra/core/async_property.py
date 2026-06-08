import asyncio
from asyncio import Task
from typing import Any, Callable, Coroutine, Generic, TypeVar

_T_co = TypeVar("_T_co", covariant=True)


class async_property(Generic[_T_co]):
    func: Callable[[Any], Coroutine[Any, Any, _T_co]]

    def __init__(self, func):
        self.func = func

    def __get__(self, obj, objtype=None) -> Coroutine[Any, Any, _T_co]:
        return self.func(obj)


class async_cached_property(Generic[_T_co]):
    func: Callable[[Any], Coroutine[Any, Any, _T_co]]

    def __init__(self, func):
        self.func = func

    def __get__(self, obj, objtype=None) -> Task[_T_co]:
        cachedFuture = getattr(obj, self.privateName, None)
        if cachedFuture is None:
            cachedFuture = asyncio.ensure_future(self.func(obj))
            setattr(obj, self.privateName, cachedFuture)
        return cachedFuture

    def __delete__(self, obj):
        if hasattr(obj, self.privateName):
            delattr(obj, self.privateName)

    def __set_name__(self, owner, name):
        self.name = name
        self.privateName = "__cachedAsyncProperty_" + name
