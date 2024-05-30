import * as html from "../core/html-utils.js";
import { BaseInfoPanel } from "./panel-base.js";

export class SourcesPanel extends BaseInfoPanel {
  static title = "sources.title";
  static id = "sources-panel";
  static fontAttributes = ["axes", "sources"];

  async setupUI() {
    const sources = await getSources(this.fontController);
    console.log("sources: ", sources);

    const container = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    for (const [identifier, source] of Object.entries(sources)) {
      // container.appendChild(
      //   new SourceBox(
      //     this.fontController,
      //     index,
      //     this.postChange.bind(this),
      //     this.setupUI.bind(this)
      //   )
      // );
    }

    this.panelElement.innerHTML = "";
    this.panelElement.style = `
    gap: 1em;
    `;
    this.panelElement.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "New source...",
        onclick: (event) => this.newSource(),
      })
    );
    this.panelElement.appendChild(container);
    this.panelElement.focus();
  }

  async newSource() {
    // open a dialog to create a new source
    console.log("Adding new source");
    const newSource = {
      name: "New Source",
      location: { wght: 400, wdth: 100, ital: 0 },
      verticalMetrics: {},
      guidelines: [],
      customData: {},
    };
    //this.fontController.putSources({'sourceIdentyfier': newSource});
    this.setupUI();
  }
}

async function getSources(fontController) {
  const sources = await fontController.getSources();
  if (Object.keys(sources).length > 0) {
    return sources;
  }
  return getSourcesTestData;
}

const getSourcesTestData = {
  "identifier-0": {
    location: { italic: 0.0, weight: 150.0, width: 0.0 },
    name: "Light Condensed",
    verticalMetrics: {
      ascender: { value: 700, zone: 16 },
      capHeight: { value: 700, zone: 16 },
      descender: { value: -200, zone: -16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
    guidelines: [
      { name: "Guideline Cap Height", y: 700 },
      { name: "Guideline Left", x: 60, angle: 90 },
      { name: "Guideline Baseline Overshoot", y: -10 },
    ],
  },
  "identifier-1": {
    location: { italic: 0.0, weight: 850.0, width: 0.0 },
    name: "Bold Condensed",
    verticalMetrics: {
      ascender: { value: 800, zone: 16 },
      capHeight: { value: 800, zone: 16 },
      descender: { value: -200, zone: 16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
  },
  "identifier-2": {
    location: { italic: 0.0, weight: 150.0, width: 1000.0 },
    name: "Light Wide",
    verticalMetrics: {
      ascender: { value: 700, zone: 16 },
      capHeight: { value: 700, zone: 16 },
      descender: { value: -200, zone: 16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
  },
  "identifier-3": {
    location: { italic: 0.0, weight: 850.0, width: 1000.0 },
    name: "Bold Wide",
    verticalMetrics: {
      ascender: { value: 800, zone: 16 },
      capHeight: { value: 800, zone: 16 },
      descender: { value: -200, zone: 16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
  },
  "identifier-4": {
    location: { italic: 0.0, weight: 595.0, width: 0.0 },
    name: "support.crossbar",
    verticalMetrics: {
      ascender: { value: 700, zone: 16 },
      capHeight: { value: 700, zone: 16 },
      descender: { value: -200, zone: 16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
    guidelines: [
      { name: "Guideline Cap Height", y: 700, zone: 16 },
      { name: "Guideline Left", x: 60, angle: 90 },
      { name: "Guideline Baseline Overshoot", y: -10 },
    ],
  },
  "identifier-5": {
    location: { italic: 0.0, weight: 595.0, width: 1000.0 },
    name: "support.S.wide",
    verticalMetrics: {
      ascender: { value: 700, zone: 16 },
      capHeight: { value: 700, zone: 16 },
      descender: { value: -200, zone: 16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
    guidelines: [
      { name: "Guideline Cap Height", y: 700, zone: 16 },
      { name: "Guideline Left", x: 60, angle: 90 },
      { name: "Guideline Baseline Overshoot", y: -10 },
    ],
  },
  "identifier-6": {
    location: { italic: 0.0, weight: 595.0, width: 569.078 },
    name: "support.S.middle",
    verticalMetrics: {
      ascender: { value: 700, zone: 16 },
      capHeight: { value: 700, zone: 16 },
      descender: { value: -200, zone: -16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
    guidelines: [
      { name: "Guideline Cap Height", y: 700, zone: 16 },
      { name: "Guideline Left", x: 60, angle: 90 },
      { name: "Guideline Baseline Overshoot", y: -10 },
    ],
  },
  "identifier-7": {
    location: { italic: 1.0, weight: 150.0, width: 0.0 },
    name: "Light Condensed Italic",
    verticalMetrics: {
      ascender: { value: 750, zone: 16 },
      capHeight: { value: 750, zone: 16 },
      descender: { value: -250, zone: -16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
  },
};
