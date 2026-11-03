import subprocess


def test_command_new(tmp_path):
    newFontPath = tmp_path / "test.fontra"

    subprocess.run(["fontra", "new", newFontPath])

    assert newFontPath.is_dir()

    assert sorted([p.name for p in newFontPath.iterdir()]) == [
        "font-data.json",
        "glyph-info.csv",
        "glyphs",
    ]
