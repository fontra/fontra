import { getGlyphInfoFromCodePoint } from "@fontra/core/glyph-data.js";
import * as html from "@fontra/core/html-utils.js";
import { features, languages, scripts } from "@fontra/core/opentype-tags.js";
import { labeledCheckbox, labeledPopupSelect } from "@fontra/core/ui-utils.js";
import { findNestedActiveElement } from "@fontra/core/utils.js";
import { Accordion } from "@fontra/web-components/ui-accordion.js";
import Panel from "./panel.js";

export default class TextEntryPanel extends Panel {
  identifier = "text-entry";
  iconPath = "/images/texttool.svg";

  static styles = `
    .text-entry-section {
      display: grid;
      grid-template-columns: auto;
      gap: 0.5em;
      height: 100%;
      overflow: hidden;
      align-content: start;
    }

    #text-align-menu {
      display: grid;
      grid-template-columns: auto auto auto;
      justify-content: start;
      gap: 0.5em;
    }

    #text-align-menu > inline-svg {
      width: 1.5rem;
      height: 1.5rem;
      position: relative;
      padding: 0.3em 0.45em 0.3em 0.45em;
      border-radius: 0.75em;
      cursor: pointer;
      user-select: none;
      transition: 120ms;
      box-sizing: content-box; /* FIXME: use border-box */
    }

    #text-align-menu > inline-svg:hover {
      background-color: #c0c0c050;
    }

    #text-align-menu > inline-svg:active {
      background-color: #c0c0c080;
    }

    #text-align-menu > inline-svg.selected {
      background-color: #c0c0c060;
    }

    #text-entry-textarea {
      background-color: var(--text-input-background-color);
      color: var(--text-input-foreground-color);
      border-radius: 0.25em;
      border: 0.5px solid lightgray;
      outline: none;
      padding: 0.2em 0.5em;
      font-family: fontra-ui-regular, sans-serif;
      font-size: 1.1rem;
      resize: none;
      overflow-x: auto;
      box-sizing: content-box;
    }

    ui-accordion {
      min-height: 0;
    }
  `;

  constructor(editorController) {
    super(editorController);

    this.textSettingsController = this.editorController.sceneSettingsController;
    this.sceneController = this.editorController.sceneController;
    this.textSettings = this.editorController.sceneSettingsController.model;

    this.textSettingsController.addKeyListener(
      ["featureSettings", "applyTextShaping", "shaper", "dumbShaper"],
      async (event) => this.updateFeatures(await this.getShaper())
    );

    this.setupTextEntryElement();
    this.setupTextAlignElement();
    this.setupAccordionElement();
    this.setupIntersectionObserver();
  }

  getContentElement() {
    return html.div(
      {
        class: "panel",
      },
      [
        html.div(
          {
            class: "panel-section text-entry-section",
          },
          [
            html.createDomElement("textarea", {
              rows: 1,
              wrap: "off",
              id: "text-entry-textarea",
            }),
            html.div(
              {
                id: "text-align-menu",
              },
              [
                html.createDomElement("inline-svg", {
                  "data-align": "left",
                  "src": "/images/alignleft.svg",
                }),
                html.createDomElement("inline-svg", {
                  "class": "selected",
                  "data-align": "center",
                  "src": "/images/aligncenter.svg",
                }),
                html.createDomElement("inline-svg", {
                  "data-align": "right",
                  "src": "/images/alignright.svg",
                }),
              ]
            ),
            html.div({ id: "text-settings-accordion" }),
          ]
        ),
      ]
    );
  }

  async getShaper() {
    const shaperPromise = this.textSettings.applyTextShaping
      ? this.textSettings.shaper
      : this.textSettings.dumbShaper;

    if (!shaperPromise) {
      return null;
    }

    const { shaper, messages, canEmulateSomeGPOS } = await shaperPromise;

    const errorMessages = messages.filter((message) => message.level != "warning");
    const numberOfErrorsMessage = errorMessages.length == 1 ? "an error" : "errors";

    this.textSettings.shaperError = errorMessages.length
      ? `The OpenType feature code contains ${numberOfErrorsMessage}`
      : null;

    this.canEmulateSomeGPOS = canEmulateSomeGPOS;

    return shaper;
  }

  _makeResetFeaturesButton(tableTag) {
    return html.createDomElement("icon-button", {
      "src": "/tabler-icons/refresh.svg",
      "onclick": async (event) => {
        const shaper = await this.getShaper();
        if (!shaper) {
          return;
        }
        const info = shaper.getFeatureInfo(tableTag);
        const featureSettings = { ...this.textSettings.featureSettings };
        Object.keys(info).forEach((featureTag) => {
          delete featureSettings[featureTag];
        });
        this.textSettings.featureSettings = featureSettings;
      },
      "data-tooltip": `Reset ${tableTag} feature settings`,
      "data-tooltipposition": "left",
    });
  }

  get gsubFeaturesItem() {
    return this.accordion.querySelector("#gsub-features-accordion-item");
  }

  get gposEmulatedFeaturesItem() {
    return this.accordion.querySelector("#gpos-emulated-features-accordion-item");
  }

  get gposFeaturesItem() {
    return this.accordion.querySelector("#gpos-features-accordion-item");
  }

  get gsubFeaturesElement() {
    return this.accordion.querySelector("#gsub-features-contents");
  }

  get gposEmulatedFeaturesElement() {
    return this.accordion.querySelector("#gpos-emulated-features-contents");
  }

  get gposFeaturesElement() {
    return this.accordion.querySelector("#gpos-features-contents");
  }

  updateAlignElement(align) {
    for (const el of this.textAlignElement.children) {
      el.classList.toggle("selected", align === el.dataset.align);
    }
  }

  setupTextAlignElement() {
    this.textAlignElement = this.contentElement.querySelector("#text-align-menu");
    this.updateAlignElement(this.textSettings.align);

    this.textSettingsController.addKeyListener("align", (event) => {
      this.updateAlignElement(this.textSettings.align);
    });

    for (const el of this.textAlignElement.children) {
      el.onclick = (event) => {
        if (event.target.classList.contains("selected")) {
          return;
        }
        this.textSettings.align = el.dataset.align;
      };
    }
  }

  setupTextEntryElement() {
    this.textEntryElement = this.contentElement.querySelector("#text-entry-textarea");
    this.textEntryElement.value = this.textSettings.text;

    const updateTextEntryElementFromModel = (event) => {
      if (event.senderInfo === this) {
        return;
      }
      this.textEntryElement.value = event.newValue;

      // https://github.com/fontra/fontra/issues/754
      // In Safari, setSelectionRange() changes the focus. We don't want that,
      // so we make sure to restore the focus to whatever it was.
      const savedActiveElement = findNestedActiveElement();
      this.textEntryElement.setSelectionRange(0, 0);
      savedActiveElement?.focus();
    };

    this.textSettingsController.addKeyListener(
      "text",
      updateTextEntryElementFromModel,
      true
    );

    this.textEntryElement.addEventListener(
      "input",
      () => {
        this.textSettingsController.setItem("text", this.textEntryElement.value, this);
        this.textSettings.selectedGlyph = null;
      },
      false
    );

    this.textSettingsController.addKeyListener(
      "text",
      (event) => {
        this.adjustTextEntryAlignment();
        this.fixTextEntryHeight();
      },
      false
    );
  }

  setupAccordionElement() {
    this.textSettingsController.addKeyListener("textScript", async (event) => {
      const shaper = await this.getShaper();
      this.updateLanguages(shaper?.getScriptAndLanguageInfo() ?? {});
    });

    this.textSettingsController.addKeyListener("shaperError", async (event) => {
      const error = this.textSettings.shaperError;
      const errorElement = this.accordion.querySelector("#features-errors");
      const messageElement = this.accordion.querySelector("#features-errors-message");
      errorElement.classList.toggle("hidden", !error);
      messageElement.innerText = error ?? "";
    });

    this.accordion = new Accordion();
    this.accordion.appendStyle(`
      .features-container {
        display: grid;
        grid-template-columns: min-content auto;
        align-items: center;
        gap: 0.4em;
        padding: 2px;
      }

      .feature-tag-button {
        --button-color: #999;
        background-color: var(--button-color);
        color: white;
        padding: 0.1em 0.75em 0.1em 0.75em;
        border-radius: 0.5em;
        font-family: menlo, monospace;
        cursor: pointer;
      }

      .feature-tag-button.emulated {
        font-style: oblique;
      }

      .feature-tag-button:active {
        --button-color: #888;
      }

      .feature-tag-button.on {
        --button-color: #00BB00;
      }

      .feature-tag-button.on:active {
        --button-color: #009900;
      }

      .feature-tag-button.off {
        --button-color: #FF0022;
      }

      .feature-tag-button.off:active {
        --button-color: #DD0011;
      }

      .feature-tag-label {
        color: var(--text-color);
        text-decoration-color: lightgray;
        cursor: pointer;
      }

      icon-button {
        width: 1.3em;
        height: 1.3em;
      }

      #shaping-options-contents {
        display: grid;
        grid-template-columns: min-content auto;
        align-items: center;
        gap: 0.5em;
      }

      #shaping-options-contents > .labeled-checkbox {
        grid-column: 1 / span 2;
      }

      #features-errors {
        grid-column: 1 / span 2;
        display: grid;
        grid-template-columns: auto auto;
        justify-content: start;
        align-items: start;
        gap: 0.5em;
        border-radius: 0.5em;
        background-color: #f885;
        padding: 0.25em 0.25em 0.5em 0.25em;
        cursor: pointer;
        color: var(--foreground-color);
      }

      #features-errors.hidden {
        display: none;
      }

      #features-errors > inline-svg {
        display: inline-block;
        width: 1.25em;
        height: 1.25em;
      }

      #features-errors-message {
        overflow: auto;
        margin: 0;
      }

    `);

    this.textScriptOptions = [{ label: "Automatic", value: null }];
    this.textLanguageOptions = [{ label: "Default (dflt)", value: null }];

    const opentypeFeaturesURL = new URL(window.location);
    opentypeFeaturesURL.pathname = "fontinfo.html";
    opentypeFeaturesURL.hash = "#opentype-feature-code-panel";

    this.accordion.items = [
      {
        id: "shaping-options-accordion-item",
        label: "Text shaping options",
        open: true,
        content: html.div({ id: "shaping-options-contents" }, [
          labeledCheckbox(
            "Apply text shaping", // TODO: translate
            this.textSettingsController,
            "applyTextShaping",
            { class: "labeled-checkbox" }
          ),
          labeledCheckbox(
            "Emulate cursive attachments", // TODO: translate
            this.textSettingsController,
            "applyCursiveAttachments",
            { class: "labeled-checkbox" }
          ),
          labeledCheckbox(
            "Emulate kerning", // TODO: translate
            this.textSettingsController,
            "applyKerning",
            { class: "labeled-checkbox" }
          ),
          labeledCheckbox(
            "Emulate mark positioning", // TODO: translate
            this.textSettingsController,
            "applyMarkPositioning",
            { class: "labeled-checkbox" }
          ),
          ...labeledPopupSelect(
            "Direction:",
            this.textSettingsController,
            "textDirection",
            [
              { value: null, label: "Automatic" },
              { value: "ltr", label: "Left-to-Right" },
              { value: "rtl", label: "Right-to-Left" },
            ]
          ),
          ...labeledPopupSelect(
            "Script:",
            this.textSettingsController,
            "textScript",
            this.textScriptOptions
          ),
          ...labeledPopupSelect(
            "Language:",
            this.textSettingsController,
            "textLanguage",
            this.textLanguageOptions
          ),
          html.a(
            {
              id: "features-errors",
              class: "hidden",
              href: opentypeFeaturesURL,
              target: "_blank",
            },
            [
              html.createDomElement("inline-svg", {
                src: "/tabler-icons/bug.svg",
              }),
              html.div({ id: "features-errors-message" }, [""]),
            ]
          ),
        ]),
      },
      {
        id: "gsub-features-accordion-item",
        label: "Substitution",
        open: true,
        hidden: true,
        content: html.div(
          { class: "features-container", id: "gsub-features-contents" },
          []
        ),
        auxiliaryHeaderElement: this._makeResetFeaturesButton("GSUB"),
      },
      {
        id: "gpos-emulated-features-accordion-item",
        label: "Emulated positioning",
        open: true,
        hidden: true,
        content: html.div(
          { class: "features-container", id: "gpos-emulated-features-contents" },
          []
        ),
        auxiliaryHeaderElement: this._makeResetFeaturesButton("GPOS-emulated"),
      },
      {
        id: "gpos-features-accordion-item",
        label: "Positioning",
        open: true,
        hidden: true,
        content: html.div(
          { class: "features-container", id: "gpos-features-contents" },
          []
        ),
        auxiliaryHeaderElement: this._makeResetFeaturesButton("GPOS"),
      },
    ];

    const placeHolder = this.contentElement.querySelector("#text-settings-accordion");
    placeHolder.replaceWith(this.accordion);
  }

  updateFeatures(shaper) {
    if (!shaper) {
      return;
    }

    const gsubFeatureInfo = shaper.getFeatureInfo("GSUB");
    const gposEmulatedFeatureInfo = shaper.getFeatureInfo("GPOS-emulated");
    const gposFeatureInfo = shaper.getFeatureInfo("GPOS");
    const scriptAndLanguageInfo = shaper.getScriptAndLanguageInfo();

    this.textScriptOptions.splice(
      0,
      Infinity,
      { label: "Automatic", value: null },
      ...Object.keys(scriptAndLanguageInfo).map((script) => ({
        label: `${scripts[script] ?? script} (${script.trim()})`,
        value: script,
      }))
    );

    if (
      this.textSettings.textScript &&
      !this.textScriptOptions.find(
        (item) => item.value === this.textSettings.textScript
      )
    ) {
      this.textSettings.textScript = null;
    }

    this.updateLanguages(scriptAndLanguageInfo);

    for (const [info, element, accordionItem] of [
      [gsubFeatureInfo, this.gsubFeaturesElement, this.gsubFeaturesItem],
      [
        gposEmulatedFeatureInfo,
        this.gposEmulatedFeaturesElement,
        this.gposEmulatedFeaturesItem,
      ],
      [gposFeatureInfo, this.gposFeaturesElement, this.gposFeaturesItem],
    ]) {
      const tags = Object.keys(info).sort();
      accordionItem.hidden = !tags.length;

      element.innerHTML = "";

      tags.forEach((tag) => {
        const cleanTag = tag.slice(0, 4); // strip "-emulated"
        const [featureDescription, url] = features[cleanTag] ?? ["", null];
        const label = info[tag]?.uiLabelName || featureDescription;
        element.append(
          ...featureTagButton(this.textSettingsController, tag, label, { url })
        );
      });
    }
  }

  updateLanguages(scriptAndLanguageInfo) {
    const { textScript, textLanguage } = this.textSettingsController.model;
    const languages = textScript ? scriptAndLanguageInfo[textScript] || [] : [];
    const languageOptions = languages.map((language) => ({
      label: `${languages[language] || language} (${language.trim()})`,
      value: language,
    }));

    if (textLanguage && !languages.includes(textLanguage)) {
      this.textSettingsController.model.textLanguage = null;
    }

    this.textLanguageOptions.splice(1, Infinity, ...languageOptions);
  }

  getFeatureInfo(shaper, tableTag) {
    const info = shaper.getFeatureInfo(tableTag);
    if (tableTag == "GPOS" && this.canEmulateSomeGPOS) {
      info["curs-emulated"] = {};
      info["kern-emulated"] = {};
      info["mark-emulated"] = {};
      info["mkmk-emulated"] = {};
    }
    return info;
  }

  fixTextEntryHeight() {
    // This adapts the text entry height to its content
    this.textEntryElement.style.height = "auto";
    this.textEntryElement.style.height = this.textEntryElement.scrollHeight + 14 + "px";
  }

  adjustTextEntryAlignment() {
    if (!this.textEntryElement.value) {
      return;
    }
    // Set the writing direction based on the first Letter in the text
    for (const char of this.textEntryElement.value) {
      const codePoint = char.codePointAt(0);
      const info = getGlyphInfoFromCodePoint(codePoint);
      if (info?.category === "Letter") {
        this.textEntryElement.dir = info?.direction == "RTL" ? "rtl" : "ltr";
        break;
      }
    }
  }

  setupIntersectionObserver() {
    const observer = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio > 0) {
            this.fixTextEntryHeight();
          }
        });
      },
      {
        root: document.documentElement,
      }
    );
    observer.observe(this.textEntryElement);
  }

  focusTextEntry() {
    this.textEntryElement.focus();
  }

  async toggle(on, focus) {
    if (focus) {
      this.focusTextEntry();
    }
  }
}

function featureTagButton(controller, featureTag, label, options) {
  const controllerKey = options?.key ?? "featureSettings";
  let state = controller.model[controllerKey]?.[featureTag];
  const id = options?.id ?? `features-button-${featureTag}`;

  const updateState = () => {
    buttonElement.classList.remove("on");
    buttonElement.classList.remove("off");
    switch (state) {
      case undefined:
        break;
      case false:
        buttonElement.classList.add("off");
        break;
      default:
        buttonElement.classList.add("on");
    }
  };

  const toggleState = (reverse = false) => {
    switch (state) {
      case undefined:
        state = reverse ? false : true;
        break;
      case false:
        state = reverse ? true : undefined;
        break;
      default:
        state = reverse ? undefined : false;
    }

    const features = { ...controller.model[controllerKey] };

    if (state !== undefined) {
      features[featureTag] = state;
    } else {
      delete features[featureTag];
    }

    controller.model[controllerKey] = features;
  };

  const buttonElement = html.div(
    {
      class: "feature-tag-button",
      onclick: (event) => toggleState(event.altKey),
    },
    [featureTag.slice(0, 4)]
  );

  if (featureTag.endsWith("-emulated")) {
    buttonElement.classList.add("emulated");
  }

  const labelElement = (options?.url ? html.a : html.div)(
    { class: "feature-tag-label", href: options?.url, target: "_blank" },
    [label]
  );

  updateState();

  return [buttonElement, labelElement];
}

customElements.define("panel-text-entry", TextEntryPanel);
