from dataclasses import dataclass

from .base import ReadableBaseBackend


@dataclass(frozen=True)
class NullBackend(ReadableBaseBackend):
    def __new__(cls):
        if not hasattr(cls, "instance"):
            cls.instance = super().__new__(cls)
        return cls.instance
