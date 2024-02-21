import Panel from "./panel.js";
import { recordChanges } from "/core/change-recorder.js";
import * as html from "/core/html-utils.js";
import { rectFromPoints, rectSize, unionRect } from "/core/rectangle.js";
import {
  getCharFromUnicode,
  makeUPlusStringFromCodePoint,
  parseSelection,
  range,
  round,
  splitGlyphNameExtension,
  throttleCalls,
} from "/core/utils.js";
import { Form } from "/web-components/ui-form.js";

export default class SelectionInfoPanel extends Panel {
  identifier = "selection-info";
  iconPath = "/images/info.svg";

  static styles = `
    .selection-info {
      display: flex;
      flex-direction: column;
      gap: 1em;
      justify-content: space-between;
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      padding: 1em;
      white-space: normal;
    }

    ui-form {
      overflow-x: hidden;
      overflow-y: auto;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.infoForm = new Form();
    this.contentElement.appendChild(this.infoForm);
    this.contentElement.appendChild(this.setupBehaviorCheckBox());
    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName", "selection", "location"],
      (event) => this.throttledUpdate()
    );

    this.sceneController.sceneSettingsController.addKeyListener(
      "positionedLines",
      (event) => {
        if (!this.haveInstance) {
          this.update(event.senderInfo?.senderID);
        }
      }
    );

    this.sceneController.addCurrentGlyphChangeListener((event) => {
      this.throttledUpdate(event.senderID);
    });

    this.sceneController.addEventListener("glyphEditCannotEditReadOnly", async () => {
      this.update();
    });

    this.sceneController.addEventListener("glyphEditLocationNotAtSource", async () => {
      this.update();
    });
  }

  getContentElement() {
    return html.div(
      {
        class: "selection-info",
      },
      []
    );
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }

  setupBehaviorCheckBox() {
    const storageKey = "fontra.selection-info.absolute-value-changes";
    this.multiEditChangesAreAbsolute = localStorage.getItem(storageKey) === "true";
    return html.div({ class: "behavior-field" }, [
      html.input({
        type: "checkbox",
        id: "behavior-checkbox",
        checked: this.multiEditChangesAreAbsolute,
        onchange: (event) => {
          this.multiEditChangesAreAbsolute = event.target.checked;
          localStorage.setItem(storageKey, event.target.checked);
        },
      }),
      html.label(
        { for: "behavior-checkbox" },
        "Multi-source value changes are absolute"
      ),
    ]);
  }

  async update(senderInfo) {
    if (
      senderInfo?.senderID === this &&
      senderInfo?.fieldKeyPath?.length !== 3 &&
      senderInfo?.fieldKeyPath?.[0] !== "component" &&
      senderInfo?.fieldKeyPath?.[2] !== "name"
    ) {
      // Don't rebuild, just update the Dimensions field
      await this.updateDimensions();
      return;
    }
    if (!this.infoForm.contentElement.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }

    await this.fontController.ensureInitialized;

    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const glyphController = await this.sceneController.sceneModel.getGlyphInstance(
      glyphName,
      this.sceneController.sceneSettings.editLayerName
    );
    let unicodes = this.fontController.glyphMap?.[glyphName] || [];

    const instance = glyphController?.instance;
    this.haveInstance = !!instance;

    const selectedGlyphInfo = this.sceneController.sceneModel.getSelectedGlyphInfo();

    if (
      selectedGlyphInfo?.isUndefined &&
      selectedGlyphInfo.character &&
      !unicodes.length
    ) {
      // Glyph does not yet exist in the font, but we can grab the unicode from
      // selectedGlyphInfo.character anyway
      unicodes = [selectedGlyphInfo.character.codePointAt(0)];
    }

    const unicodesStr = makeUnicodesString(unicodes);
    let baseUnicodesStr;
    if (glyphName && !unicodes.length) {
      const [baseGlyphName, _] = splitGlyphNameExtension(glyphName);
      baseUnicodesStr = makeUnicodesString(
        this.fontController.glyphMap?.[baseGlyphName]
      );
    }

    const formContents = [];
    if (glyphName) {
      formContents.push({
        key: "glyphName",
        type: "text",
        label: "Glyph name",
        value: glyphName,
      });
      formContents.push({
        key: "unicodes",
        type: "text",
        label: "Unicode",
        value: unicodesStr,
      });
      if (baseUnicodesStr) {
        formContents.push({
          key: "baseUnicodes",
          type: "text",
          label: "Base unicode",
          value: baseUnicodesStr,
        });
      }
      if (instance) {
        formContents.push({
          type: "edit-number",
          key: '["xAdvance"]',
          label: "Advance width",
          value: instance.xAdvance,
          minValue: 0,
          getValue: (layerGlyph, layerName, fieldItem) => {
            return layerGlyph.xAdvance;
          },
          setValue: async (layerGlyph, layerName, fieldItem, value) => {
            const translationX = value - layerGlyph.xAdvance;
            await this.updateInfoForm(
              '["rightMargin"]',
              parseInt(this.infoForm.getValue('["rightMargin"]')) + translationX
            );
            layerGlyph.xAdvance = value;
          },
        });
      }

      if (instance) {
        formContents.push({
          type: "edit-number-x-y",
          key: '["sidebearings"]',
          label: "Sidebearings",
          fieldX: {
            key: '["leftMargin"]',
            value: glyphController.leftMargin,
            getValue: (layerGlyph, layerName, fieldItem) => {
              return layerGlyph.leftMargin;
            },
            setValue: async (layerGlyph, layerName, fieldItem, value) => {
              /*
              const glyphController =
                await this.sceneController.sceneModel.getGlyphInstance(
                  glyphName,
                  layerName
                );
              */

              const translationX = value - glyphController.leftMargin;

              console.log("heyyy!", layerName, translationX);
              if (layerGlyph.path) {
                for (const i in range(0, layerGlyph.path.coordinates.length, 2)) {
                  layerGlyph.path.coordinates[i] += translationX;
                }
              }

              if (layerGlyph.components) {
                for (let i = 0; i < layerGlyph.components.length; i++) {
                  layerGlyph.components[i].transformation.translateX += translationX;
                }
              }

              layerGlyph.xAdvance = glyphController.xAdvance + translationX;
            },
          },
          fieldY: {
            key: '["rightMargin"]',
            value: glyphController.rightMargin,
            getValue: (layerGlyph, layerName, fieldItem) => {
              return layerGlyph.rightMargin;
            },
            setValue: async (layerGlyph, layerName, fieldItem, value) => {
              const glyphController =
                await this.sceneController.sceneModel.getGlyphInstance(
                  glyphName,
                  layerName
                );

              const translationX = value - glyphController.rightMargin;
              //const translationX = value - parseInt(this.infoForm.getValue('["rightMargin"]'));
              console.log("heyyy!", layerName, translationX);
              console.log("heyyy!", value, glyphController.rightMargin);
              await this.updateInfoForm(
                '["xAdvance"]',
                parseInt(this.infoForm.getValue('["xAdvance"]')) + translationX
              );
              //layerGlyph.xAdvance = layerGlyph.xAdvance + translationX;
            },
          },
        });
      }
    }

    const { pointIndices, componentIndices } = this._getSelection();

    if (glyphController) {
      formContents.push(
        ...this._setupDimensionsInfo(glyphController, pointIndices, componentIndices)
      );
    }

    for (const index of componentIndices) {
      if (!instance) {
        break;
      }
      const component = instance.components[index];
      if (!component) {
        // Invalid selection
        continue;
      }
      const componentKey = (...path) => JSON.stringify(["components", index, ...path]);

      formContents.push({ type: "divider" });
      formContents.push({ type: "header", label: `Component #${index}` });
      formContents.push({
        type: "edit-text",
        key: componentKey("name"),
        label: "Base glyph",
        value: component.name,
      });
      formContents.push({ type: "header", label: "Transformation" });

      formContents.push({
        type: "edit-number-x-y",
        label: "translate",
        fieldX: {
          key: componentKey("transformation", "translateX"),
          value: component.transformation.translateX,
        },
        fieldY: {
          key: componentKey("transformation", "translateY"),
          value: component.transformation.translateY,
        },
      });

      formContents.push({
        type: "edit-angle",
        key: componentKey("transformation", "rotation"),
        label: "rotation",
        value: component.transformation.rotation,
      });

      formContents.push({
        type: "edit-number-x-y",
        label: "scale",
        fieldX: {
          key: componentKey("transformation", "scaleX"),
          value: component.transformation.scaleX,
        },
        fieldY: {
          key: componentKey("transformation", "scaleY"),
          value: component.transformation.scaleY,
        },
      });

      formContents.push({
        type: "edit-number-x-y",
        label: "skew",
        fieldX: {
          key: componentKey("transformation", "skewX"),
          value: component.transformation.skewX,
        },
        fieldY: {
          key: componentKey("transformation", "skewY"),
          value: component.transformation.skewY,
        },
      });

      formContents.push({
        type: "edit-number-x-y",
        label: "center",
        fieldX: {
          key: componentKey("transformation", "tCenterX"),
          value: component.transformation.tCenterX,
        },
        fieldY: {
          key: componentKey("transformation", "tCenterY"),
          value: component.transformation.tCenterY,
        },
      });

      const baseGlyph = await this.fontController.getGlyph(component.name);
      if (baseGlyph && component.location) {
        const locationItems = [];
        const axes = Object.fromEntries(
          baseGlyph.axes.map((axis) => [axis.name, axis])
        );
        // Add global axes, if in location and not in baseGlyph.axes
        // TODO: this needs more thinking, as the axes of *nested* components
        // may also be of interest. Also: we need to be able to *add* such a value
        // to component.location.
        for (const axis of this.fontController.globalAxes) {
          if (axis.name in component.location && !(axis.name in axes)) {
            axes[axis.name] = axis;
          }
        }
        const axisList = Object.values(axes);
        // Sort axes: lowercase first, uppercase last
        axisList.sort((a, b) => {
          const firstCharAIsUpper = a.name[0] === a.name[0].toUpperCase();
          const firstCharBIsUpper = b.name[0] === b.name[0].toUpperCase();
          if (firstCharAIsUpper != firstCharBIsUpper) {
            return firstCharBIsUpper ? -1 : 1;
          } else {
            return a.name < b.name ? -1 : +1;
          }
        });
        for (const axis of axisList) {
          let value = component.location[axis.name];
          if (value === undefined) {
            value = axis.defaultValue;
          }
          locationItems.push({
            type: "edit-number-slider",
            key: componentKey("location", axis.name),
            label: axis.name,
            value: value,
            minValue: axis.minValue,
            defaultValue: axis.defaultValue,
            maxValue: axis.maxValue,
          });
        }
        if (locationItems.length) {
          formContents.push({ type: "header", label: "Location" });
          formContents.push(...locationItems);
        }
      }
    }

    this._formFieldsByKey = {};
    for (const field of formContents) {
      if (field.fieldX) {
        this._formFieldsByKey[field.fieldX.key] = field.fieldX;
        this._formFieldsByKey[field.fieldY.key] = field.fieldY;
      } else {
        this._formFieldsByKey[field.key] = field;
      }
    }

    if (!formContents.length) {
      this.infoForm.setFieldDescriptions([{ type: "text", value: "(No selection)" }]);
    } else {
      this.infoForm.setFieldDescriptions(formContents);
      await this._setupSelectionInfoHandlers(glyphName);
    }
  }

  _setupDimensionsInfo(glyphController, pointIndices, componentIndices) {
    const dimensionsString = this._getDimensionsString(
      glyphController,
      pointIndices,
      componentIndices
    );
    const formContents = [];
    if (dimensionsString) {
      formContents.push({ type: "divider" });
      formContents.push({
        key: "dimensions",
        type: "text",
        label: "Dimensions",
        value: dimensionsString,
      });
    }
    return formContents;
  }

  async updateInfoForm(key, value) {
    if (this.infoForm.hasKey(key)) {
      this.infoForm.setValue(key, value);
    }
  }

  async updateDimensions() {
    const glyphController =
      await this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const { pointIndices, componentIndices } = this._getSelection();
    const dimensionsString = this._getDimensionsString(
      glyphController,
      pointIndices,
      componentIndices
    );
    if (this.infoForm.hasKey("dimensions")) {
      this.infoForm.setValue("dimensions", dimensionsString);
    }
  }

  _getSelection() {
    const { point, component, componentOrigin, componentTCenter } = parseSelection(
      this.sceneController.selection
    );

    const componentIndices = [
      ...new Set([
        ...(component || []),
        ...(componentOrigin || []),
        ...(componentTCenter || []),
      ]),
    ].sort((a, b) => a - b);
    return { pointIndices: point || [], componentIndices };
  }

  _getDimensionsString(glyphController, pointIndices, componentIndices) {
    const selectionRects = [];
    if (pointIndices.length) {
      const instance = glyphController.instance;
      const selRect = rectFromPoints(
        pointIndices.map((i) => instance.path.getPoint(i)).filter((point) => !!point)
      );
      if (selRect) {
        selectionRects.push(selRect);
      }
    }
    for (const componentIndex of componentIndices) {
      const component = glyphController.components[componentIndex];
      if (!component || !component.controlBounds) {
        continue;
      }
      selectionRects.push(component.bounds);
    }
    if (!selectionRects.length && glyphController?.controlBounds) {
      selectionRects.push(glyphController.bounds);
    }
    if (selectionRects.length) {
      const selectionBounds = unionRect(...selectionRects);
      let { width, height } = rectSize(selectionBounds);
      width = round(width, 1);
      height = round(height, 1);
      return `↔ ${width} ↕ ${height}`;
    }
  }

  async _setupSelectionInfoHandlers(glyphName) {
    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      const changePath = JSON.parse(fieldItem.key);
      const senderInfo = { senderID: this, fieldKeyPath: changePath };

      const getFieldValue = fieldItem.getValue || defaultGetFieldValue;
      const setFieldValue = fieldItem.setValue || defaultSetFieldValue;
      const deleteFieldValue = fieldItem.deleteValue || defaultDeleteFieldValue;

      await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
        const layerInfo = Object.entries(
          this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
        ).map(([layerName, layerGlyph]) => {
          return {
            layerName,
            layerGlyph,
            orgValue: getFieldValue(layerGlyph, layerName, fieldItem),
          };
        });

        let changes;

        if (valueStream) {
          // Continuous changes (eg. slider drag)
          for await (const value of valueStream) {
            for (const { layerName, layerGlyph, orgValue } of layerInfo) {
              if (orgValue !== undefined) {
                setFieldValue(layerGlyph, layerName, fieldItem, orgValue); // Ensure getting the correct undo change
              } else {
                deleteFieldValue(layerGlyph, layerName, fieldItem);
              }
            }
            changes = applyNewValue(
              glyph,
              layerInfo,
              value,
              fieldItem,
              this.multiEditChangesAreAbsolute
            );
            await sendIncrementalChange(changes.change, true); // true: "may drop"
          }
        } else {
          // Simple, atomic change
          changes = applyNewValue(
            glyph,
            layerInfo,
            value,
            fieldItem,
            this.multiEditChangesAreAbsolute
          );
        }

        const undoLabel =
          changePath.length == 1
            ? `${changePath.at(-1)}`
            : `${changePath.at(-2)}.${changePath.at(-1)}`;
        return {
          changes: changes,
          undoLabel: undoLabel,
          broadcast: true,
        };
      }, senderInfo);
    };
  }
}

function defaultGetFieldValue(subject, layerName, fieldItem) {
  const changePath = JSON.parse(fieldItem.key);
  return getNestedValue(subject, changePath);
}

function defaultSetFieldValue(subject, layerName, fieldItem, value) {
  const changePath = JSON.parse(fieldItem.key);
  return setNestedValue(subject, changePath, value);
}

function defaultDeleteFieldValue(subject, layerName, fieldItem) {
  const changePath = JSON.parse(fieldItem.key);
  return deleteNestedValue(subject, changePath);
}

function getNestedValue(subject, path) {
  for (const pathElement of path) {
    if (subject === undefined) {
      throw new Error(`assert -- invalid change path: ${path}`);
    }
    subject = subject[pathElement];
  }
  return subject;
}

function setNestedValue(subject, path, value) {
  const key = path.slice(-1)[0];
  path = path.slice(0, -1);
  subject = getNestedValue(subject, path);
  subject[key] = value;
}

function deleteNestedValue(subject, path) {
  const key = path.slice(-1)[0];
  path = path.slice(0, -1);
  subject = getNestedValue(subject, path);
  delete subject[key];
}

function applyNewValue(glyph, layerInfo, value, fieldItem, absolute) {
  const setFieldValue = fieldItem.setValue || defaultSetFieldValue;

  const primaryOrgValue = layerInfo[0].orgValue;
  const isNumber = typeof primaryOrgValue === "number";
  const delta = isNumber && !absolute ? value - primaryOrgValue : null;
  return recordChanges(glyph, (glyph) => {
    const layers = glyph.layers;
    for (const { layerName, orgValue } of layerInfo) {
      let newValue =
        delta === null || orgValue === undefined ? value : orgValue + delta;
      if (isNumber) {
        newValue = maybeClampValue(newValue, fieldItem.minValue, fieldItem.maxValue);
      }
      setFieldValue(layers[layerName].glyph, layerName, fieldItem, newValue);
    }
  });
}

function maybeClampValue(value, min, max) {
  if (min !== undefined) {
    value = Math.max(value, min);
  }
  if (max !== undefined) {
    value = Math.min(value, max);
  }
  return value;
}

function makeUnicodesString(unicodes) {
  return (unicodes || [])
    .map(
      (code) =>
        `${makeUPlusStringFromCodePoint(code)}\u00A0(${getCharFromUnicode(code)})`
    )
    .join(" ");
}

customElements.define("panel-selection-info", SelectionInfoPanel);
