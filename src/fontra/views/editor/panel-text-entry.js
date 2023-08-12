import * as html from "/core/unlit.js";
import Panel from "./panel.js";

export default class TextEntryPanel extends Panel {
  name = "text-entry";
  icon = "/images/texttool.svg";

  getContentElement() {
    return html.div(
      {
        class: "sidebar-text-entry",
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
              dataAlign: "left",
              src: "/images/alignleft.svg",
            }),
            html.createDomElement("inline-svg", {
              class: "selected",
              dataAlign: "center",
              src: "/images/aligncenter.svg",
            }),
            html.createDomElement("inline-svg", {
              dataAlign: "right",
              src: "/images/alignright.svg",
            }),
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
    this.textAlignElement = document.querySelector("#text-align-menu");
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
    this.textEntryElement = document.querySelector("#text-entry-textarea");
    this.textEntryElement.value = this.textSettings.text;

    const updateTextEntryElementFromModel = (event) => {
      if (event.senderInfo === this) {
        return;
      }
      this.textEntryElement.value = event.newValue;
      this.textEntryElement.setSelectionRange(0, 0);
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

  setupInteractionObserver() {
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

  attach(editorController) {
    this.textSettingsController = editorController.sceneSettingsController;
    this.sceneController = editorController.sceneController;
    this.textSettings = editorController.sceneSettingsController.model;

    this.setupTextEntryElement();
    this.setupTextAlignElement();
    this.setupInteractionObserver();
  }
}
