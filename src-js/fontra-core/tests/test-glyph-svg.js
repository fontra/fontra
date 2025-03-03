import { expect } from "chai";

import { SVGPath2D } from "@fontra/core/glyph-svg.js";

describe("SVGPath2D tests", () => {
  it("empty path", () => {
    const p = new SVGPath2D();
    expect(p.getPath()).to.equal("");
  });

  it("simple open path", () => {
    const p = new SVGPath2D();
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.lineTo(100, 100);
    p.lineTo(100, 0);
    expect(p.getPath()).to.equal("M0,0L0,100L100,100L100,0");
  });

  it("simple closed path", () => {
    const p = new SVGPath2D();
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.lineTo(100, 100);
    p.lineTo(100, 0);
    p.closePath();
    expect(p.getPath()).to.equal("M0,0L0,100L100,100L100,0Z");
  });

  it("cubic curve", () => {
    const p = new SVGPath2D();
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.bezierCurveTo(20, 130, 80, 130, 100, 100);
    p.lineTo(100, 0);
    p.closePath();
    expect(p.getPath()).to.equal("M0,0L0,100C20,130 80,130 100,100L100,0Z");
  });

  it("quadratic curve", () => {
    const p = new SVGPath2D();
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.quadraticCurveTo(50, 150, 100, 100);
    p.lineTo(100, 0);
    p.closePath();
    expect(p.getPath()).to.equal("M0,0L0,100Q50,150 100,100L100,0Z");
  });

  it("precision 0 digits", () => {
    const p = new SVGPath2D(1, 0);
    p.moveTo(0.1, 0.2);
    p.lineTo(0.4, 0.5);
    p.lineTo(0.51, 0.5523456);
    expect(p.getPath()).to.equal("M0,0L0,1L1,1");
  });

  it("precision 1 digit", () => {
    const p = new SVGPath2D();
    p.moveTo(0.1, 0.2);
    p.lineTo(0.24, 0.25);
    p.lineTo(0.251, 0.2523456);
    expect(p.getPath()).to.equal("M0.1,0.2L0.2,0.3L0.3,0.3");
  });

  it("precision 2 digits", () => {
    const p = new SVGPath2D(1, 2);
    p.moveTo(0.1, 0.2);
    p.lineTo(0.24, 0.25);
    p.lineTo(0.251, 0.2523456);
    expect(p.getPath()).to.equal("M0.1,0.2L0.24,0.25L0.25,0.25");
  });

  it("scale 2", () => {
    const p = new SVGPath2D(2);
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.lineTo(100, 100);
    p.lineTo(100, 0);
    expect(p.getPath()).to.equal("M0,0L0,200L200,200L200,0");
  });

  it("scale 1/3", () => {
    const p = new SVGPath2D(1 / 3);
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.lineTo(100, 100);
    p.lineTo(100, 0);
    expect(p.getPath()).to.equal("M0,0L0,33.3L33.3,33.3L33.3,0");
  });

  it("scale 1/3 precision 3 digits", () => {
    const p = new SVGPath2D(1 / 3, 3);
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.lineTo(100, 100);
    p.lineTo(100, 0);
    expect(p.getPath()).to.equal("M0,0L0,33.333L33.333,33.333L33.333,0");
  });

  it("offset 20 30", () => {
    const p = new SVGPath2D(1, 1, 20, 30);
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.lineTo(100, 100);
    p.lineTo(100, 0);
    expect(p.getPath()).to.equal("M20,30L20,130L120,130L120,30");
  });

  it("scale 2 offset 20 30", () => {
    const p = new SVGPath2D(2, 1, 20, 30);
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.lineTo(100, 100);
    p.lineTo(100, 0);
    expect(p.getPath()).to.equal("M20,30L20,230L220,230L220,30");
  });
});
