import { FontController } from "@fontra/core/font-controller.js";
import { FontraBackend } from "@fontra/core/fontra-backend.js";
import { LocalFontEngine } from "@fontra/core/local-font-engine.js";
import { NodePath } from "./node-path.js";

import { expect } from "chai";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const moduleDirName = dirname(fileURLToPath(import.meta.url));
const mutatorSansPath = join(
  dirname(dirname(dirname(moduleDirName))),
  "test-common",
  "fonts",
  "MutatorSans.fontra"
);

export async function getFontController(path) {
  const backend = new FontraBackend(new NodePath(path));
  await backend.initialize();
  const engine = new LocalFontEngine(backend);
  const fontController = new FontController(engine);
  await fontController.initialize();
  return fontController;
}

describe("FontController tests", async () => {
  it("FontController misc", async () => {
    const expectedWeightAxis = {
      name: "weight",
      label: "weight",
      tag: "wght",
      minValue: 100,
      defaultValue: 100,
      maxValue: 900,
      mapping: [
        [100, 150],
        [900, 850],
      ],
    };

    const fontController = await getFontController(mutatorSansPath);
    expect(fontController.unitsPerEm).to.equal(1000);
    expect(Object.keys(fontController.glyphMap).length).to.equal(55);
    expect(Object.keys(fontController.characterMap).length).to.equal(74);
    expect(fontController.glyphMap["A"]).to.deep.equal([65, 97]);
    expect(fontController.characterMap[65]).to.equal("A");
    expect(fontController.characterMap[97]).to.equal("A");
    expect(fontController.axes.mappings).to.deep.equal([]);
    expect(fontController.axes.axes.length).to.deep.equal(3);
    expect(fontController.axes.axes[0]).to.deep.equal(expectedWeightAxis);
    expect(Object.keys(fontController.sources).length).to.equal(8);
    expect(fontController.sources["light-condensed"].name).to.equal("LightCondensed");
    expect(await fontController.getFontInfo()).to.deep.equal({
      copyright: "License same as MutatorMath. BSD 3-clause. [test-token: C]",
      familyName: "MutatorMathTest",
      licenseDescription: "License same as MutatorMath. BSD 3-clause. [test-token: C]",
      vendorID: "LTTR",
      versionMajor: 1,
      versionMinor: 2,
    });
    expect((await fontController.getFeatures()).text).to.equal("");
    expect(await fontController.getGlyphInfos()).to.deep.equal({});
    expect(await fontController.getShaperFontData()).to.equal(null);

    const kerning = await fontController.getKerning();
    expect(kerning["kern"].sourceIdentifiers).to.deep.equal([
      "light-condensed",
      "bold-condensed",
      "light-wide",
      "bold-wide",
      "light-condensed-italic",
    ]);
    expect(kerning["kern"].groupsSide1).to.deep.equal({
      A: ["A", "Aacute", "Adieresis"],
    });
    expect(kerning["kern"].groupsSide2).to.deep.equal({
      A: ["A", "Aacute", "Adieresis"],
    });
    expect(kerning["kern"].values["@A"]["V"]).to.deep.equal([
      -15,
      null,
      -180,
      null,
      null,
    ]);

    const kerningInstance = (
      await fontController.getKerningController("kern")
    ).instantiate({ weight: 400 });
    expect(kerningInstance.getGlyphPairValue("A", "V")).to.equal(-27.5);

    const source = fontController.fontSourcesInstancer.instantiate({ weight: 850 });
    expect(source.name).to.equal("BoldCondensed");
  });

  it("getGlyphInstance neutral", async () => {
    const fontController = await getFontController(mutatorSansPath);
    const glyphController = await fontController.getGlyphInstance("A", {});
    // expect(Object.keys(glyphController.glyphMap).length).to.equal(11);
    expect(glyphController.instance.xAdvance).to.equal(396);
    expect(glyphController.instance.path.coordinates.length).to.equal(32);
  });

  it("getGlyphInstance interpolation", async () => {
    const fontController = await getFontController(mutatorSansPath);
    const glyphController = await fontController.getGlyphInstance("A", { weight: 500 });
    expect(glyphController.instance.xAdvance).to.equal(568);
    expect(glyphController.instance.path.coordinates.length).to.equal(32);
  });
});
