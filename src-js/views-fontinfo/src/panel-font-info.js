import { recordChanges } from "@fontra/core/change-recorder.js";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { Form } from "@fontra/web-components/ui-form.js";
import { BaseInfoPanel } from "./panel-base.js";

const fontInfoFields = [
  // [property name, localization key, type]
  ["familyName", "font-info.familyname", "edit-text"],
  ["copyright", "font-info.copyright", "edit-text"],
  ["trademark", "font-info.trademark", "edit-text"],
  ["description", "font-info.description", "edit-text"],
  ["sampleText", "font-info.sampletext", "edit-text"],
  ["designer", "font-info.designer", "edit-text"],
  ["designerURL", "font-info.designer.url", "edit-text"],
  ["manufacturer", "font-info.manufacturer", "edit-text"],
  ["manufacturerURL", "font-info.manufacturer.url", "edit-text"],
  ["licenseDescription", "font-info.licensedescription", "edit-text"],
  ["licenseInfoURL", "font-info.licenseinfo.url", "edit-text"],
  ["vendorID", "font-info.vendorid", "edit-text"],
  ["versionMajor", "font-info.version.major", "edit-number"],
  ["versionMinor", "font-info.version.minor", "edit-number"],
];

addStyleSheet(`
.fontra-ui-font-info-axes-panel {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
}
`);

export class FontInfoPanel extends BaseInfoPanel {
  static title = "font-info.title";
  static id = "font-info-panel";
  static fontAttributes = ["fontInfo", "unitsPerEm"];

  async setupUI() {
    const info = await this.fontController.getFontInfo();

    this.infoForm = new Form();
    this.infoForm.className = "fontra-ui-font-info-axes-panel";
    this.infoForm.labelWidth = "max-content";

    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      const [rootKey, itemKey] = JSON.parse(fieldItem.key);
      const undoLabel = `change ${itemKey ? itemKey : rootKey}`; // TODO: translation

      const root = {
        fontInfo: await this.fontController.getFontInfo(),
        unitsPerEm: this.fontController.unitsPerEm,
      };
      const changes = recordChanges(root, (root) => {
        if (itemKey) {
          const subject = root[rootKey];
          subject[itemKey] = value;
        } else {
          root[rootKey] = value;
        }
      });
      if (changes.hasChange) {
        await this.postChange(changes.change, changes.rollbackChange, undoLabel);
      }
    };

    const formContents = [];

    formContents.push(
      ...fontInfoFields.map(([key, loclKey, type]) => {
        return {
          type: type,
          key: JSON.stringify(["fontInfo", key]),
          label: translate(loclKey),
          value: info[key],
          minValue: type === "edit-number" ? 0 : undefined,
          integer: type === "edit-number" ? true : undefined,
          ...(key === "vendorID" ? { width: "4em" } : {}),
        };
      })
    );
    formContents.push({
      type: "edit-number",
      key: JSON.stringify(["unitsPerEm"]),
      label: translate("font-info.upm"),
      value: this.fontController.unitsPerEm,
      minValue: 1,
      integer: true,
    });

    this.infoForm.setFieldDescriptions(formContents);

    this.panelElement.innerHTML = "";
    this.panelElement.appendChild(this.infoForm);
  }
}
