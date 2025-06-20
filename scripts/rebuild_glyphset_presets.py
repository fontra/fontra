#!/usr/bin/env python


import argparse
import json
import pathlib
from urllib.request import Request, urlopen

AUTH_TOKEN = None


def fetchJSON(url):
    request = Request(url)
    if AUTH_TOKEN:
        request.add_header("Authorization", f"token {AUTH_TOKEN}")
    response = urlopen(request)
    data = response.read()
    return json.loads(data)


# Unauthenticated: max. 60 request per hour, authenticated 5000 per hour
# https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28#primary-rate-limit-for-unauthenticated-users
def getGitHubDirectoryInfo(org, repo, path):
    dirURL = f"https://api.github.com/repos/{org}/{repo}/contents/{path}"
    return fetchJSON(dirURL)


def jsDelivrURL(org, repo, path):
    return f"https://cdn.jsdelivr.net/gh/{org}/{repo}/{path}"


def getGoogleFontsGlyphSets():
    sourceURL = "https://github.com/googlefonts/glyphsets"

    dirContents = getGitHubDirectoryInfo(
        "googlefonts", "glyphsets", "data/results/txt/nice-names/"
    )

    glyphSets = []

    for dirInfo in dirContents:
        name = dirInfo["name"]
        assert name.endswith(".txt")
        name = " ".join(name[:-4].split("_"))
        glyphSets.append(
            {
                "name": name,
                "url": jsDelivrURL("googlefonts", "glyphsets", dirInfo["path"]),
            }
        )

    return {
        "name": "Google Fonts",
        "sourceURL": sourceURL,
        "dataOptions": {"dataFormat": "glyph-names", "commentChars": "#"},
        "glyphSets": glyphSets,
    }


def getBlackFoundryGlyphSets():
    sourceURL = "https://github.com/BlackFoundryCom/BF_font_standard"

    glyphSets = []

    for topInfo in getGitHubDirectoryInfo("BlackFoundryCom", "BF_font_standard", ""):
        if topInfo["type"] != "dir":
            continue

        for dirInfo in getGitHubDirectoryInfo(
            "BlackFoundryCom", "BF_font_standard", topInfo["name"]
        ):
            name = dirInfo["name"]
            if not name.endswith(".csv"):
                continue

            name = " ".join(name[:-4].split("_"))
            name = name.capitalize()
            name = "BF " + name
            glyphSets.append(
                {
                    "name": name,
                    "url": jsDelivrURL(
                        "BlackFoundryCom", "BF_font_standard", dirInfo["path"]
                    ),
                }
            )

    return {
        "name": "Black Foundry",
        "sourceURL": sourceURL,
        "dataOptions": {
            "dataFormat": "tsv/csv",
            "hasHeader": True,
            "codePointColumn": "unicode hex",
            "glyphNameColumn": "name",
        },
        "glyphSets": glyphSets,
    }


def getAdobeLatinCyrGreekGlyphSets():
    sourceURL = "https://github.com/orgs/adobe-type-tools/repositories?q=charsets"

    glyphSets = []

    repos = ["adobe-latin-charsets", "adobe-cyrillic-charsets", "adobe-greek-charsets"]

    for repo in repos:
        for topInfo in getGitHubDirectoryInfo("adobe-type-tools", repo, ""):
            name = topInfo["name"]
            if not name.endswith(".txt"):
                continue
            if "-combined" in name:
                # Incompatible format
                continue

            name = " ".join(p.capitalize() for p in name[:-4].split("-"))

            glyphSets.append(
                {
                    "name": name,
                    "url": jsDelivrURL("adobe-type-tools", repo, topInfo["path"]),
                }
            )

    return {
        "name": "Adobe Latin, Cyrillic, Greek",
        "sourceURL": sourceURL,
        "dataOptions": {
            "dataFormat": "tsv/csv",
            "hasHeader": True,
            "codePointColumn": "Unicode",
            "glyphNameColumn": "Glyph name",
        },
        "glyphSets": glyphSets,
    }


def getKoeberlinLatinGlyphSets():
    sourceURL = "https://github.com/koeberlin/Latin-Character-Sets"

    dirContents = getGitHubDirectoryInfo(
        "koeberlin", "Latin-Character-Sets", "CharacterSets/Glyphs/"
    )

    glyphSets = []

    for dirInfo in dirContents:
        name = dirInfo["name"]
        if not name.endswith(".txt"):
            continue
        name = name.split("_")[0]
        assert name[:5] == "Latin"
        name = f"Koeberlin {name[:5]} {name[5:]}"
        glyphSets.append(
            {
                "name": name,
                "url": jsDelivrURL(
                    "koeberlin", "Latin-Character-Sets", dirInfo["path"]
                ),
            }
        )

    order = {k: i for i, k in enumerate(["XS", "S", "M", "L", "XL", "XXL"])}
    glyphSets.sort(
        key=lambda glyphSet: (
            order.get(glyphSet["name"].split()[-1], len(order)),
            glyphSet["name"],
        )
    )

    return {
        "name": "Koeberlin Latin",
        "sourceURL": sourceURL,
        "dataOptions": {"dataFormat": "glyph-names"},
        "glyphSets": glyphSets,
    }


def getWickedLettersGeorgianGlyphSets():
    sourceURL = "https://github.com/wickedletters/Georgian-Character-set"

    dirContents = getGitHubDirectoryInfo("wickedletters", "Georgian-Character-set", "")

    glyphSets = []

    for dirInfo in dirContents:
        name = dirInfo["name"]
        if not name.endswith(".txt"):
            continue
        name = "WL Georgian " + name[:-4].split("_")[-1]
        glyphSets.append(
            {
                "name": name,
                "url": jsDelivrURL(
                    "wickedletters", "Georgian-Character-set", dirInfo["path"]
                ),
            }
        )

    return {
        "name": "Wicked Letters, Georgian",
        "sourceURL": sourceURL,
        "dataOptions": {"dataFormat": "glyph-names", "commentChars": "#"},
        "glyphSets": glyphSets,
    }


def collectCollections():
    collections = []
    collections.append(getGoogleFontsGlyphSets())
    collections.append(getBlackFoundryGlyphSets())
    collections.append(getAdobeLatinCyrGreekGlyphSets())
    collections.append(getKoeberlinLatinGlyphSets())
    collections.append(getWickedLettersGeorgianGlyphSets())
    return collections


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--token")
    args = parser.parse_args()
    AUTH_TOKEN = args.token

    collections = collectCollections()

    repoDir = pathlib.Path(__file__).resolve().parent.parent
    glyphSetDataPath = (
        repoDir / "src-js" / "fontra-core" / "assets" / "data" / "glyphset-presets.json"
    )
    with open(glyphSetDataPath, "w") as f:
        json.dump(collections, f, indent=2) + "\n"
