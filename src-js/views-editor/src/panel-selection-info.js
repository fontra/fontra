import { applicationSettingsController } from "@fontra/core/application-settings.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { rectFromPoints, rectSize, unionRect } from "@fontra/core/rectangle.js";
import { compute, nameCapture } from "@fontra/core/simple-compute.js";
import { getDecomposedIdentity } from "@fontra/core/transform.js";
import {
  assert,
  enumerate,
  getCharFromCodePoint,
  makeUPlusStringFromCodePoint,
  parseSelection,
  range,
  rgbaToHex,
  round,
  splitGlyphNameExtension,
  throttleCalls,
} from "@fontra/core/utils.js";
import { showMenu } from "@fontra/web-components/menu-panel.js";
import { dialog } from "@fontra/web-components/modal-dialog.js";
import { Form } from "@fontra/web-components/ui-form.js";
import Panel from "./panel.js";

export default class SelectionInfoPanel extends Panel {
  identifier = "selection-info";
  iconPath = "/images/info.svg";

  constructor(editorController) {
    super(editorController);
    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    this.sceneController.sceneSettingsController.addKeyListener(
      [
        "selectedGlyphName",
        "selection",
        "fontLocationSourceMapped",
        "glyphLocation",
        "editLayerName",
      ],
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

    applicationSettingsController.addKeyListener(
      ["alwaysShowGlobalAxesInComponentLocation", "sortComponentLocationGlyphAxes"],
      (event) => this.update()
    );
  }

  getContentElement() {
    this.infoForm = new Form();
    return html.div(
      {
        class: "panel",
      },
      [
        html.div(
          { class: "panel-section panel-section--flex panel-section--scrollable" },
          [this.infoForm]
        ),
        html.div(
          { class: "panel-section panel-section--checkbox" },
          this.getBehaviorElements()
        ),
      ]
    );
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }

  getBehaviorElements() {
    const storageKey = "fontra.selection-info.absolute-value-changes";
    this.multiEditChangesAreAbsolute = localStorage.getItem(storageKey) === "true";
    return [
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
        translate("sidebar.selection-info.multi-source")
      ),
    ];
  }

  async update(senderInfo) {
    if (
      senderInfo?.senderID === this &&
      ((senderInfo?.fieldKeyPath?.length !== 3 &&
        senderInfo?.fieldKeyPath?.[0] !== "component" &&
        senderInfo?.fieldKeyPath?.[2] !== "name") ||
        senderInfo?.fieldKeyPath?.[0] === "backgroundImage")
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
    let codePoints = this.fontController.glyphMap?.[glyphName] || [];

    const instance = glyphController?.instance;
    this.haveInstance = !!instance;

    const positionedGlyph =
      this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const varGlyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();
    const glyphLocked = !!varGlyphController?.glyph.customData["fontra.glyph.locked"];

    if (
      positionedGlyph?.isUndefined &&
      positionedGlyph.character &&
      !codePoints.length
    ) {
      // Glyph does not yet exist in the font, but we can grab the unicode from
      // positionedGlyph.character anyway
      codePoints = [positionedGlyph.character.codePointAt(0)];
    }

    const codePointsStr = makeCodePointsString(codePoints);
    let baseCodePointsStr;
    if (glyphName && !codePoints.length) {
      const [baseGlyphName, _] = splitGlyphNameExtension(glyphName);
      baseCodePointsStr = makeCodePointsString(
        this.fontController.glyphMap?.[baseGlyphName]
      );
    }

    const kerningController = await this.fontController.getKerningController("kern");

    const formContents = [];
    if (glyphName) {
      formContents.push({
        type: "header",
        label: translate("sidebar.selection-info.title"),
        auxiliaryElement: html.createDomElement("icon-button", {
          "id": "glyphLocking",
          "style": `width: 1.3em; height: 1.3em;`,
          "src":
            glyphLocked || this.fontController.readOnly
              ? "/tabler-icons/lock.svg"
              : "/tabler-icons/lock-open-2.svg",
          "onclick": (event) => this._toggleGlyphLock(varGlyphController.glyph),
          "data-tooltip": translate(
            this.fontController.readOnly
              ? "sidebar.selection-info.glyph-locking.tooltip.read-only"
              : glyphLocked
              ? "sidebar.selection-info.glyph-locking.tooltip.unlock"
              : "sidebar.selection-info.glyph-locking.tooltip.lock"
          ),
          "data-tooltipposition": "left",
        }),
      });
      formContents.push({
        key: "glyphName",
        type: "text",
        label: translate("sidebar.selection-info.glyph-name"),
        value: glyphName,
      });
      formContents.push({
        key: "unicodes",
        type: "text",
        label: translate("sidebar.selection-info.unicode"),
        value: codePointsStr,
      });
      if (baseCodePointsStr) {
        formContents.push({
          key: "baseUnicodes",
          type: "text",
          label: translate("sidebar.selection-info.base-unicode"),
          value: baseCodePointsStr,
        });
      }
      if (instance) {
        formContents.push({
          type: "edit-number",
          key: '["xAdvance"]',
          label: translate("sidebar.selection-info.advance-width"),
          value: instance.xAdvance,
          numDigits: 1,
          evaluateExpression: async (expression) =>
            await this._evaluateMetricsExpression(
              expression,
              varGlyphController,
              "xAdvance"
            ),
          minValue: 0,
        });
        formContents.push({
          type: "edit-number-x-y",
          key: '["sidebearings"]',
          label: translate("sidebar.selection-info.sidebearings"),
          fieldX: {
            key: '["leftMargin"]',
            value: glyphController.leftMargin,
            numDigits: 1,
            disabled: glyphController.leftMargin == undefined,
            evaluateExpression: async (expression) =>
              await this._evaluateMetricsExpression(
                expression,
                varGlyphController,
                "leftMargin"
              ),
            getValue: (layerGlyph, layerGlyphController, fieldItem) => {
              return layerGlyphController.leftMargin;
            },
            setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
              const translationX = maybeClampValue(
                value - layerGlyphController.leftMargin,
                -layerGlyph.xAdvance,
                undefined
              );
              for (const i of range(0, layerGlyph.path.coordinates.length, 2)) {
                layerGlyph.path.coordinates[i] += translationX;
              }
              for (const compo of layerGlyph.components) {
                compo.transformation.translateX += translationX;
              }
              layerGlyph.xAdvance += translationX;
            },
          },
          fieldY: {
            key: '["rightMargin"]',
            value: glyphController.rightMargin,
            numDigits: 1,
            evaluateExpression: async (expression) =>
              await this._evaluateMetricsExpression(
                expression,
                varGlyphController,
                "rightMargin"
              ),
            disabled: glyphController.rightMargin == undefined,
            getValue: (layerGlyph, layerGlyphController, fieldItem) => {
              return layerGlyphController.rightMargin;
            },
            setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
              const translationX = maybeClampValue(
                value - layerGlyphController.rightMargin,
                -layerGlyph.xAdvance,
                undefined
              );
              layerGlyph.xAdvance += translationX;
            },
          },
        });
        formContents.push({
          type: "edit-text-double",
          key: '["kern-l-r"]',
          label: translate("sidebar.selection-info.kern-group-l-r"),
          field1: {
            key: '["kernLeft"]',
            value: kerningController.rightPairGroupMapping[glyphName] || "",
            setValuePlain: (fieldItem, value) => {
              kerningController.editGroupSide2(glyphName, value.trim());
            },
          },
          field2: {
            key: '["kernRight"]',
            value: kerningController.leftPairGroupMapping[glyphName] || "",
            setValuePlain: (fieldItem, value) => {
              kerningController.editGroupSide1(glyphName, value.trim());
            },
          },
        });
      }
    }

    const { pointIndices, componentIndices, backgroundImageIndices } =
      this._getSelection();

    if (glyphController) {
      formContents.push(
        ...this._setupDimensionsInfo(glyphController, pointIndices, componentIndices)
      );
    }

    for (const index of backgroundImageIndices) {
      assert(index === 0, "only a single bg image is supported");

      const backgroundImage = instance?.backgroundImage;
      if (!backgroundImage) {
        continue;
      }

      const backgroundImageKey = (...path) =>
        JSON.stringify(["backgroundImage", ...path]);

      formContents.push({ type: "divider" });
      formContents.push({
        type: "header",
        label: translate("sidebar.user-settings.glyph.background-image"),
        auxiliaryElement: html.createDomElement("icon-button", {
          "style": `width: 1.3em;`,
          "src": "/tabler-icons/refresh.svg",
          "onclick": (event) => this._resetTransformationForBackgroundImage(),
          "data-tooltip": translate(
            "sidebar.selection-info.component.reset-transformation"
          ),
          "data-tooltipposition": "left",
        }),
      });

      formContents.push({
        type: "color-picker",
        key: backgroundImageKey("color"),
        label: translate("background-image.labels.colorize"),
        continuousDelay: 150,
        allowNoColor: true,
        value: backgroundImage.color,
        parseColor: (value) => {
          const matches = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
          const channels = matches.slice(1, 4).map((ch) => parseInt(ch, 16) / 255);
          return { red: channels[0], green: channels[1], blue: channels[2] };
        },
        formatColor: (value) =>
          value ? rgbaToHex([value.red, value.green, value.blue]) : "#000000",
      });

      formContents.push({
        type: "edit-number-slider",
        key: backgroundImageKey("opacity"),
        label: translate("background-image.labels.opacity"),
        value: backgroundImage.opacity,
        minValue: 0,
        defaultValue: 1.0,
        maxValue: 1.0,
      });

      formContents.push({ type: "line-spacer" });

      addTransformationItems(
        formContents,
        backgroundImageKey,
        backgroundImage.transformation
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
      formContents.push({
        type: "header",
        label: translate("sidebar.selection-info.component", index),
      });
      formContents.push({
        type: "edit-text",
        key: componentKey("name"),
        label: translate("sidebar.selection-info.component.base-glyph"),
        value: component.name,
      });
      formContents.push({
        type: "header",
        label: translate("sidebar.selection-info.component.transformation"),
        auxiliaryElement: html.createDomElement("icon-button", {
          "style": `width: 1.3em;`,
          "src": "/tabler-icons/refresh.svg",
          "onclick": (event) => this._resetTransformationForComponent(index),
          "data-tooltip": translate(
            "sidebar.selection-info.component.reset-transformation"
          ),
          "data-tooltipposition": "left",
        }),
      });

      addTransformationItems(formContents, componentKey, component.transformation);

      const baseGlyph = await this.fontController.getGlyph(component.name);

      if (baseGlyph) {
        const showGlobalAxes =
          this.sceneController.applicationSettings
            .alwaysShowGlobalAxesInComponentLocation;

        const fontAxisNames = baseGlyph.continuousFontAxisNames;
        const selectedFontAxisNames = [...fontAxisNames].filter(
          (axisName) =>
            showGlobalAxes ||
            Object.values(varGlyphController.layers).some((layer) =>
              layer.glyph.components[index]?.location.hasOwnProperty(axisName)
            )
        );

        const glyphAxisNames = [...baseGlyph.glyphAxisNames];
        if (this.sceneController.applicationSettings.sortComponentLocationGlyphAxes) {
          glyphAxisNames.sort((a, b) => {
            const firstCharAIsUpper = a[0] === a[0].toUpperCase();
            const firstCharBIsUpper = b[0] === b[0].toUpperCase();
            if (firstCharAIsUpper != firstCharBIsUpper) {
              return firstCharBIsUpper ? -1 : 1;
            } else {
              return a < b ? -1 : +1;
            }
          });
        }

        const axisNames = [...selectedFontAxisNames, ...glyphAxisNames];

        const locationItems = [];

        // TODO: this needs more thinking, as the axes of *nested* components may also
        // be of interest. We would then need to be able to *add* such a value to
        // component.location. This could work somewhat similar to showing global axes.
        // Given we have no direct use case, we'll leave this for now.

        const combinedAxes = Object.fromEntries(
          baseGlyph.combinedAxes.map((axis) => [axis.name, axis])
        );

        for (const axisName of axisNames) {
          const isGlobalAxis = fontAxisNames.has(axisName);
          const axis = combinedAxes[axisName];
          const value = component.location[axis.name];
          const currentGlobalAxisLocationValue =
            this.sceneController.sceneSettingsController.model.fontLocationSourceMapped[
              axisName
            ] ?? axis.defaultValue;

          locationItems.push({
            type: "edit-number-slider",
            key: componentKey("location", axis.name),
            label: axis.name,
            value: value,
            minValue: axis.minValue,
            defaultValue: axis.defaultValue,
            maxValue: axis.maxValue,
            hasCheckBox: isGlobalAxis,
            fallbackValue: isGlobalAxis ? currentGlobalAxisLocationValue : undefined,
          });
        }

        if (locationItems.length || true) {
          formContents.push({
            type: "header",
            label: "Location",
            auxiliaryElement: html.div(
              {
                style: `width: auto; display: flex; flex-direction: row; gap: 0.15em;`,
              },
              [
                html.createDomElement("icon-button", {
                  "id": "component-axis-options-button",
                  "style": `width: 1.3em;`,
                  "src": "/tabler-icons/menu-2.svg",
                  "onclick": (event) => this.showComponentAxesOptionsMenu(event),
                  "data-tooltip": translate(
                    "sidebar.designspace-navigation.font-axes-view-options-button.tooltip"
                  ),
                  "data-tooltipposition": "left",
                }),
                html.createDomElement("icon-button", {
                  "style": `width: 1.3em;`,
                  "src": "/tabler-icons/refresh.svg",
                  "onclick": (event) => this._resetAxisValuesForComponent(index),
                  "data-tooltip": translate(
                    "sidebar.selection-info.component.reset-axis-values"
                  ),
                  "data-tooltipposition": "left",
                }),
              ]
            ),
          });
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
      this.infoForm.setFieldDescriptions([
        { type: "text", value: translate("selection.none") },
      ]);
    } else {
      this.infoForm.setFieldDescriptions(formContents);
      if (glyphController) {
        await this._setupSelectionInfoHandlers(glyphName);
      }
    }
  }

  showComponentAxesOptionsMenu(event) {
    const menuItems = [
      {
        title: translate("Show global axes"),
        callback: () => {
          this.sceneController.applicationSettings.alwaysShowGlobalAxesInComponentLocation =
            !this.sceneController.applicationSettings
              .alwaysShowGlobalAxesInComponentLocation;
        },
        checked:
          this.sceneController.applicationSettings
            .alwaysShowGlobalAxesInComponentLocation,
      },
      {
        title: translate("Sort glyph axes"),
        callback: () => {
          this.sceneController.applicationSettings.sortComponentLocationGlyphAxes =
            !this.sceneController.applicationSettings.sortComponentLocationGlyphAxes;
        },
        checked:
          this.sceneController.applicationSettings.sortComponentLocationGlyphAxes,
      },
    ];

    const button = this.infoForm.shadowRoot.querySelector(
      "#component-axis-options-button"
    );
    const buttonRect = button.getBoundingClientRect();
    showMenu(menuItems, { x: buttonRect.right, y: buttonRect.bottom });
  }

  async _toggleGlyphLock(varGlyph) {
    if (varGlyph.customData["fontra.glyph.locked"]) {
      const result = await dialog(
        translate("sidebar.selection-info.dialog.unlock-glyph.title", varGlyph.name),
        "",
        [
          { title: translate("dialog.cancel"), isCancelButton: true },
          { title: translate("dialog.yes"), isDefaultButton: true, resultValue: "ok" },
        ]
      );

      if (!result) {
        // User cancelled
        return;
      }
    }

    const iconElement = this.infoForm.shadowRoot.querySelectorAll("#glyphLocking")[0];
    iconElement.src = varGlyph.customData["fontra.glyph.locked"]
      ? "/tabler-icons/lock-open-2.svg"
      : "/tabler-icons/lock.svg";

    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        if (glyph.customData["fontra.glyph.locked"]) {
          delete glyph.customData["fontra.glyph.locked"];
        } else {
          glyph.customData["fontra.glyph.locked"] = true;
        }
        return glyph.customData["fontra.glyph.locked"]
          ? translate("sidebar.selection-info.glyph-locking.tooltip.lock")
          : translate("sidebar.selection-info.glyph-locking.tooltip.unlock");
      },
      undefined,
      undefined,
      true // ignoreGlyphLock
    );
  }

  async _resetTransformationForComponent(componentIndex) {
    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );

      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        layerGlyph.components[componentIndex].transformation = getDecomposedIdentity();
      }
      return translate("sidebar.selection-info.component.reset-transformation");
    });
  }

  async _resetTransformationForBackgroundImage() {
    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );

      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        if (layerGlyph.backgroundImage) {
          layerGlyph.backgroundImage.transformation = getDecomposedIdentity();
        }
      }
      return translate("sidebar.selection-info.component.reset-transformation");
    });
  }

  async _resetAxisValuesForComponent(componentIndex) {
    const glyphController =
      await this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const compo = glyphController.instance.components[componentIndex];
    const baseGlyph = await this.fontController.getGlyph(compo.name);
    if (!baseGlyph) {
      return;
    }

    const defaultValues = baseGlyph.combinedAxes.map((axis) => [
      axis.name,
      axis.defaultValue,
    ]);

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );

      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        const compo = layerGlyph.components[componentIndex];
        for (const [axisName, axisValue] of defaultValues) {
          if (axisName in compo.location) {
            compo.location[axisName] = axisValue;
          }
        }
      }
      return translate("sidebar.selection-info.component.reset-axis-values");
    });
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
        label: translate("sidebar.selection-info.dimensions"),
        value: dimensionsString,
      });
    }
    return formContents;
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
    const { point, component, componentOrigin, componentTCenter, backgroundImage } =
      parseSelection(this.sceneController.selection);

    const componentIndices = [
      ...new Set([
        ...(component || []),
        ...(componentOrigin || []),
        ...(componentTCenter || []),
      ]),
    ].sort((a, b) => a - b);
    return {
      pointIndices: point || [],
      componentIndices,
      backgroundImageIndices: backgroundImage || [],
    };
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
    const varGlyph = await this.fontController.getGlyph(glyphName);

    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      if (fieldItem.setValuePlain) {
        assert(!valueStream, "unexpected valueStream");
        fieldItem.setValuePlain(fieldItem, value);
      } else {
        await this._onFieldChangeForGlyph(
          glyphName,
          varGlyph,
          fieldItem,
          value,
          valueStream
        );
      }
    };
  }

  async _onFieldChangeForGlyph(glyphName, varGlyph, fieldItem, value, valueStream) {
    const changePath = JSON.parse(fieldItem.key);
    const senderInfo = { senderID: this, fieldKeyPath: changePath };

    const getFieldValue = fieldItem.getValue || defaultGetFieldValue;
    const setFieldValue = fieldItem.setValue || defaultSetFieldValue;
    const deleteFieldValue = fieldItem.deleteValue || defaultDeleteFieldValue;

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layerInfo = [];
      for (const [layerName, layerGlyph] of Object.entries(
        this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      )) {
        const layerGlyphController = await this.fontController.getLayerGlyphController(
          glyphName,
          layerName,
          varGlyph.getSourceIndexForLayerName(layerName)
        );
        layerInfo.push({
          layerName,
          layerGlyph,
          layerGlyphController,
          orgValue: getFieldValue(layerGlyph, layerGlyphController, fieldItem),
        });
      }

      let changes;

      if (valueStream) {
        // Continuous changes (eg. slider drag)
        for await (const value of valueStream) {
          for (const { layerGlyph, layerGlyphController, orgValue } of layerInfo) {
            if (orgValue !== undefined) {
              setFieldValue(layerGlyph, layerGlyphController, fieldItem, orgValue); // Ensure getting the correct undo change
            } else {
              deleteFieldValue(layerGlyph, layerGlyphController, fieldItem);
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

    if (["xAdvance", "leftMargin", "rightMargin"].includes(changePath[0])) {
      this._updateGlyphMetrics(glyphName, changePath[0]);
    }
  }

  async _updateGlyphMetrics(glyphName, changedKey) {
    const keyMap = {
      xAdvance: "rightMargin",
      leftMargin: "xAdvance",
      rightMargin: "xAdvance",
    };
    const glyphController = await this.sceneController.sceneModel.getGlyphInstance(
      glyphName,
      this.sceneController.sceneSettings.editLayerName
    );

    const keyToUpdata = keyMap[changedKey];
    const fieldKey = JSON.stringify([keyToUpdata]);
    this.infoForm.setValue(fieldKey, glyphController[keyToUpdata]);
  }

  async _evaluateMetricsExpression(expression, varGlyphController, metricProperty) {
    const sidebearingOpposites = {
      leftMargin: "rightMargin",
      rightMargin: "leftMargin",
    };

    let value = Number(expression);
    if (!isNaN(value)) {
      return value;
    }

    const { names, namespace } = nameCapture(
      this.fontController.glyphMap,
      (nameObject, name) =>
        nameObject[name] ||
        (sidebearingOpposites[metricProperty] &&
          name.endsWith("!") &&
          nameObject[name.slice(0, -1)])
          ? 1
          : undefined
    );

    try {
      const dummyResult = compute(expression, undefined, namespace);
    } catch (e) {
      return { error: e.message };
    }

    const { mainLayerName, locations } = this._getEditingLocations(varGlyphController);

    const layerVariables = {};
    for (const name of names) {
      const referencedGlyphName = name.endsWith("!") ? name.slice(0, -1) : name;
      const referencedGlyph = await this.fontController.getGlyph(referencedGlyphName);
      for (const [layerName, location] of Object.entries(locations)) {
        const getGlyphFunc = this.fontController.getGlyph.bind(this.fontController);
        const instanceController = await referencedGlyph.instantiateController(
          location,
          layerName,
          getGlyphFunc
        );
        if (!layerVariables[layerName]) {
          layerVariables[layerName] = {};
        }
        layerVariables[layerName][referencedGlyphName] =
          instanceController[metricProperty];
        if (name.endsWith("!") && sidebearingOpposites[metricProperty]) {
          layerVariables[layerName][referencedGlyphName + "!"] =
            instanceController[sidebearingOpposites[metricProperty]];
        }
      }
    }

    return {
      getValue: (layerName) => {
        try {
          return ensureFiniteNumber(
            compute(expression, undefined, layerVariables[layerName])
          );
        } catch (e) {
          console.error(e);
        }
        return 0;
      },
      value: ensureFiniteNumber(
        compute(expression, undefined, layerVariables[mainLayerName])
      ),
    };
  }

  _getEditingLocations(varGlyphController) {
    const layerNames = new Set(this.sceneController.editingLayerNames);
    const locations = {};
    for (const [sourceIndex, source] of enumerate(varGlyphController.sources)) {
      if (layerNames.has(source.layerName) && !locations[source.layerName]) {
        locations[source.layerName] = varGlyphController.getSourceLocation(source);
      }
    }
    return { mainLayerName: this.sceneController.editingLayerNames[0], locations };
  }
}

function addTransformationItems(formContents, keyFunc, transformation) {
  formContents.push({
    type: "edit-number-x-y",
    label: translate("sidebar.selection-info.component.translate"),
    fieldX: {
      key: keyFunc("transformation", "translateX"),
      value: transformation.translateX,
    },
    fieldY: {
      key: keyFunc("transformation", "translateY"),
      value: transformation.translateY,
    },
  });

  formContents.push({
    type: "edit-angle",
    key: keyFunc("transformation", "rotation"),
    label: translate("sidebar.selection-info.component.rotation"),
    value: transformation.rotation,
  });

  formContents.push({
    type: "edit-number-x-y",
    label: translate("sidebar.selection-info.component.scale"),
    fieldX: {
      key: keyFunc("transformation", "scaleX"),
      value: transformation.scaleX,
    },
    fieldY: {
      key: keyFunc("transformation", "scaleY"),
      value: transformation.scaleY,
    },
  });

  formContents.push({
    type: "edit-number-x-y",
    label: translate("sidebar.selection-info.component.skew"),
    fieldX: {
      key: keyFunc("transformation", "skewX"),
      value: transformation.skewX,
    },
    fieldY: {
      key: keyFunc("transformation", "skewY"),
      value: transformation.skewY,
    },
  });

  formContents.push({
    type: "edit-number-x-y",
    label: translate("sidebar.selection-info.component.center"),
    fieldX: {
      key: keyFunc("transformation", "tCenterX"),
      value: transformation.tCenterX,
    },
    fieldY: {
      key: keyFunc("transformation", "tCenterY"),
      value: transformation.tCenterY,
    },
  });
}

function defaultGetFieldValue(glyph, glyphController, fieldItem) {
  const changePath = JSON.parse(fieldItem.key);
  return getNestedValue(glyph, changePath);
}

function defaultSetFieldValue(glyph, glyphController, fieldItem, value) {
  const changePath = JSON.parse(fieldItem.key);
  return setNestedValue(glyph, changePath, value);
}

function defaultDeleteFieldValue(glyph, glyphController, fieldItem) {
  const changePath = JSON.parse(fieldItem.key);
  return deleteNestedValue(glyph, changePath);
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
  const deleteFieldValue = fieldItem.deleteValue || defaultDeleteFieldValue;

  const primaryOrgValue = layerInfo[0].orgValue;
  const isNumber = typeof primaryOrgValue === "number";
  const delta =
    isNumber && !absolute && !value?.getValue ? value - primaryOrgValue : null;
  return recordChanges(glyph, (glyph) => {
    const layers = glyph.layers;
    for (const { layerName, layerGlyphController, orgValue } of layerInfo) {
      if (value == null) {
        deleteFieldValue(layers[layerName].glyph, layerGlyphController, fieldItem);
      } else {
        const layerValue = value?.getValue ? value.getValue(layerName) : value;

        let newValue =
          delta === null || orgValue === undefined ? layerValue : orgValue + delta;

        if (isNumber) {
          newValue = maybeClampValue(newValue, fieldItem.minValue, fieldItem.maxValue);
        }
        setFieldValue(
          layers[layerName].glyph,
          layerGlyphController,
          fieldItem,
          newValue
        );
      }
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

function makeCodePointsString(codePoints) {
  return (codePoints || [])
    .map(
      (code) =>
        `${makeUPlusStringFromCodePoint(code)}\u00A0(${getCharFromCodePoint(code)})`
    )
    .join(" ");
}

function ensureFiniteNumber(value, fallback = 0) {
  if (isNaN(value) || Math.abs(value) === Infinity) {
    console.log(`bad expression result: ${value}, fall back to 0`);
    value = fallback;
  }
  return value;
}

customElements.define("panel-selection-info", SelectionInfoPanel);
