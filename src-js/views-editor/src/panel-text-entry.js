import * as html from "@fontra/core/html-utils.js";
import { labeledCheckbox } from "@fontra/core/ui-utils.js";
import { findNestedActiveElement } from "@fontra/core/utils.js";
import { Form } from "@fontra/web-components/ui-form.js";
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

    this.setupTextEntryElement();
    this.setupTextAlignElement();
    this.setupApplyKerningElement();
    this.setupTextSizeForm();
    this.setupTextSizeHandler();
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
            html.div({ id: "apply-kerning-checkbox" }),
            html.div({ id: "text-size-form" }),
          ]
        ),
      ]
    );
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

  setupTextSizeForm() {
    this.textSizeForm = new Form();
    const formContents = [];

    formContents.push({
      type: "header",
      label: "Text Size", // TODO: translate
    });

    const buttonSet = html.createDomElement("icon-button", {
      "src": "/tabler-icons/resize.svg",
      "onclick": (event) => {
        this.editorController.zoomToFontSize(this.textSettings.textSize);
      },
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Set text size", // TODO: translate
      "data-tooltipposition": "top",
    });

    formContents.push({
      type: "edit-number-slider",
      key: "textSize",
      label: buttonSet,
      value: this.textSettings.textSize,
      defaultValue: 12,
      minValue: 8,
      maxValue: 96,
      step: 1,
    });

    const checkboxCleanPreview = labeledCheckbox(
      "Use this size in clean view", // TODO: translate
      this.textSettingsController,
      "cleanViewSizePreview",
      {}
    );

    formContents.push({
      type: "single-icon",
      element: checkboxCleanPreview,
    });

    this.textSizeForm.setFieldDescriptions(formContents);

    this.textSizeForm.style.setProperty("--label-column-width", "20%");

    const placeHolder = this.contentElement.querySelector("#text-size-form");
    placeHolder.replaceWith(this.textSizeForm);
  }

  setupTextSizeHandler() {
    this.textSettingsController.addKeyListener("textSize", (event) => {
      this.textSizeForm.setValue("textSize", event.newValue);
    });

    this.textSizeForm.addEventListener("endChange", (event) => {
      if (event.detail.key == "textSize") {
        this.textSettings.textSize = this.textSizeForm.getValue("textSize");
      }
    });
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
      (event) => this.fixTextEntryHeight(),
      false
    );
  }

  fixTextEntryHeight() {
    // This adapts the text entry height to its content
    this.textEntryElement.style.height = "auto";
    this.textEntryElement.style.height = this.textEntryElement.scrollHeight + 14 + "px";
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

customElements.define("panel-text-entry", TextEntryPanel);
