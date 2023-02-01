from fontra.core.server import addVersionTokenToReferences
import pytest


VERSION_TOKEN = "dummy"
EXTENSIONS = ["css", "html", "ico", "js", "svg", "woff2"]


@pytest.mark.parametrize(
    "inputData, expectedData",
    [
        (
            """  "http://domain.com/some-module.js" """,
            """  "http://domain.com/some-module.js" """,
        ),
        (
            """  'http://domain.com/some-module.js' """,
            """  'http://domain.com/some-module.js' """,
        ),
        (
            """  "some-module.js" """,
            """  "some-module.js" """,
        ),
        (
            """  './some module.js' """,
            """  './some module.js' """,
        ),
        (
            """  "./some-module.js" """,
            """  "./some-module.dummy.js" """,
        ),
        (
            """  "./some-dir/some-module.js" """,
            """  "./some-dir/some-module.dummy.js" """,
        ),
        (
            """  "/some-dir/some-module.js" """,
            """  "/some-dir/some-module.dummy.js" """,
        ),
        (
            """  "some-dir/some-module.js" """,
            """  "some-dir/some-module.js" """,
        ),
        (
            """  './some-module.js' """,
            """  './some-module.dummy.js' """,
        ),
        (
            """  "./some-module.js' """,
            """  "./some-module.js' """,
        ),
    ],
)
def test_addVersionTokenToReferences(inputData, expectedData):
    data = addVersionTokenToReferences(inputData, VERSION_TOKEN, EXTENSIONS)
    assert expectedData == data
