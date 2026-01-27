import { getGlyphInfoFromCodePoint } from "@fontra/core/glyph-data.js";
import * as html from "@fontra/core/html-utils.js";
import { labeledCheckbox } from "@fontra/core/ui-utils.js";
import { findNestedActiveElement } from "@fontra/core/utils.js";
import { Accordion } from "@fontra/web-components/ui-accordion.js";
import Panel from "./panel.js";

export default class TextEntryPanel extends Panel {
  identifier = "text-entry";
  iconPath = "/images/texttool.svg";

  static styles = `
    .text-entry-section {
      display: flex;
      flex-direction: column;
      gap: 0.5em;
      max-height: 100%;
      overflow-y: auto;
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
  `;

  constructor(editorController) {
    super(editorController);

    this.textSettingsController = this.editorController.sceneSettingsController;
    this.sceneController = this.editorController.sceneController;
    this.textSettings = this.editorController.sceneSettingsController.model;

    this.textSettingsController.addKeyListener("features", (event) =>
      this.fontController.getShaper().then((shaper) => this.updateFeatures(shaper))
    );

    this.setupTextEntryElement();
    this.setupTextAlignElement();
    this.setupApplyKerningElement();
    this.setupIntersectionObserver();
  }

  getContentElement() {
    this.fontController.getShaper().then((shaper) => this.updateFeatures(shaper));
    this.accordion = new Accordion();
    this.accordion.appendStyle(`
      .features-container {
        display: grid;
        grid-template-columns: min-content auto;
        align-items: center;
        gap: 0.5em;
      }

      .feature-tag-button {
        background-color: gray;
        color: white;
        padding: 0.25em 1em 0.25em 1em;
        border-radius: 0.5em;
        font-family: monospace;
        font-size: 1.15em;
        cursor: pointer;
      }

      .feature-tag-button.on {
        background-color: green;
      }

      .feature-tag-button.off {
        background-color: red;
      }

      .feature-tag-label {
        cursor: pointer;
      }
    `);

    this.accordion.items = [
      {
        id: "gsub-features-accordion-item",
        label: "Substitution features",
        open: true,
        hidden: true,
        content: html.div(
          { class: "features-container", id: "gsub-features-contents" },
          []
        ),
      },
      {
        id: "gpos-features-accordion-item",
        label: "Positioning features",
        open: true,
        hidden: true,
        content: html.div(
          { class: "features-container", id: "gpos-features-contents" },
          []
        ),
      },
    ];

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
            html.div({ id: "apply-kerning-checkbox" }),
            this.accordion,
          ]
        ),
      ]
    );
  }

  get gsubFeaturesItem() {
    return this.accordion.querySelector("#gsub-features-accordion-item");
  }

  get gposFeaturesItem() {
    return this.accordion.querySelector("#gpos-features-accordion-item");
  }

  get gsubFeaturesElement() {
    return this.accordion.querySelector("#gsub-features-contents");
  }

  get gposFeaturesElement() {
    return this.accordion.querySelector("#gpos-features-contents");
  }

  updateFeatures(shaper) {
    const gsubFeatures = shaper.getFeatureTags("GSUB");
    const gposFeatures = shaper.getFeatureTags("GPOS");

    const gsubFeaturesElement = this.gsubFeaturesElement;
    const gposFeaturesElement = this.gposFeaturesElement;

    gsubFeaturesElement.innerHTML = "";
    gposFeaturesElement.innerHTML = "";

    function labelForFeatureTag(featureTag) {
      return `label for ${featureTag}`;
    }

    gsubFeatures.forEach((featureTag) => {
      gsubFeaturesElement.append(
        ...featureTagButton(
          this.textSettingsController,
          featureTag,
          labelForFeatureTag(featureTag)
        )
      );
    });

    gposFeatures.forEach((featureTag) => {
      gposFeaturesElement.append(
        ...featureTagButton(
          this.textSettingsController,
          featureTag,
          labelForFeatureTag(featureTag)
        )
      );
    });

    this.gsubFeaturesItem.hidden = !gsubFeatures.length;
    this.gposFeaturesItem.hidden = !gposFeatures.length;
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

  setupApplyKerningElement() {
    this.applyKerningCheckBox = labeledCheckbox(
      "Apply kerning", // TODO: translate
      this.textSettingsController,
      "applyKerning",
      {}
    );

    const placeHolder = this.contentElement.querySelector("#apply-kerning-checkbox");
    placeHolder.replaceWith(this.applyKerningCheckBox);
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

  fixTextEntryHeight() {
    // This adapts the text entry height to its content
    this.textEntryElement.style.height = "auto";
    this.textEntryElement.style.height = this.textEntryElement.scrollHeight + 14 + "px";
  }

  adjustTextEntryAlignment() {
    if (!this.textEntryElement.value) {
      return;
    }
    // If the first character is RTL, do align right
    const codePoint = this.textEntryElement.value.codePointAt(0);
    const info = getGlyphInfoFromCodePoint(codePoint);
    const align = info.direction == "RTL" ? "end" : "start";
    this.textEntryElement.style = `text-align: ${align}`;
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
  const controllerKey = options?.key ?? "features";
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

  const toggleState = () => {
    switch (state) {
      case undefined:
        state = true;
        break;
      case false:
        state = undefined;
        break;
      default:
        state = false;
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
      onclick: (event) => toggleState(),
    },
    [featureTag]
  );

  const labelElement = html.div(
    { class: "feature-tag-label", onclick: (event) => buttonElement.click() },
    [label]
  );

  updateState();

  return [buttonElement, labelElement];
}

customElements.define("panel-text-entry", TextEntryPanel);
