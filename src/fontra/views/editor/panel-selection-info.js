import * as html from "/core/unlit.js";
import { recordChanges } from "/core/change-recorder.js";
import { rectFromPoints, rectSize, unionRect } from "/core/rectangle.js";
import { Form } from "/core/ui-form.js";
import Panel from "./panel.js";
import {
  throttleCalls,
  parseSelection,
  makeUPlusStringFromCodePoint,
  getCharFromUnicode,
  round,
} from "/core/utils.js";

export default class SelectionInfoPanel extends Panel {
  name = "selection-info";
  icon = "/images/info.svg";

  getContentElement() {
    return html.div(
      {
        class: "selection-info",
      },
      [
        html.div(
          {
            id: "selection-info",
          },
          []
        ),
      ]
    );
  }

  attach(editorController) {
    this.infoForm = new Form("selection-info");
    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);
    this.fontController = editorController.fontController;
    this.sceneController = editorController.sceneController;

    editorController.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName", "selection", "location"],
      (event) => this.throttledUpdate()
    );

    editorController.sceneController.sceneSettingsController.addKeyListener(
      "positionedLines",
      (event) => {
        if (!this.haveInstance) {
          this.update(event.senderID?.senderID);
        }
      }
    );

    editorController.sceneController.addCurrentGlyphChangeListener((event) => {
      this.throttledUpdate(event.senderID);
    });
  }

  async update(senderID) {
    if (senderID === this) {
      // Don't rebuild, just update the Dimensions field
      await this.updateDimensions();
      return;
    }
    if (!this.infoForm.container.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }
    await this.fontController.ensureInitialized;
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const glyphController = await this.sceneController.sceneModel.getGlyphInstance(
      glyphName
    );
    let unicodes = this.fontController.glyphMap?.[glyphName] || [];
    const positionedGlyph =
      this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const instance = positionedGlyph?.glyph.instance;
    this.haveInstance = !!instance;

    if (positionedGlyph?.isUndefined && positionedGlyph.character && !unicodes.length) {
      // Glyph does not yet exist in the font, but we can grab the unicode from
      // positionedGlyph.character anyway
      unicodes = [positionedGlyph.character.codePointAt(0)];
    }

    const unicodesStr = unicodes
      .map(
        (code) =>
          `${makeUPlusStringFromCodePoint(code)}\u00A0(${getCharFromUnicode(code)})`
      )
      .join(" ");

    const canEdit = glyphController?.canEdit;

    const formContents = [];
    if (glyphName && instance) {
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
      formContents.push({
        type: "edit-number",
        key: '["xAdvance"]',
        label: "Advance width",
        value: instance.xAdvance,
        disabled: !canEdit,
      });
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

      for (const key of [
        "translateX",
        "translateY",
        "rotation",
        "scaleX",
        "scaleY",
        "skewX",
        "skewY",
        "tCenterX",
        "tCenterY",
      ]) {
        const value = component.transformation[key];
        formContents.push({
          type: "edit-number",
          key: componentKey("transformation", key),
          label: key,
          value: value,
          disabled: !canEdit,
        });
      }
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
        for (const axis of Object.values(axes)) {
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
            maxValue: axis.maxValue,
            disabled: !canEdit,
          });
        }
        if (locationItems.length) {
          formContents.push({ type: "header", label: "Location" });
          formContents.push(...locationItems);
        }
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

  async updateDimensions() {
    const glyphController =
      await this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const { pointIndices, componentIndices } = this._getSelection();
    const dimensionsString = this._getDimensionsString(
      glyphController,
      pointIndices,
      componentIndices
    );
    this.infoForm.setValue("dimensions", dimensionsString);
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
    this.infoForm.onFieldChange = async (fieldKey, value, valueStream) => {
      const changePath = JSON.parse(fieldKey);
      await this.sceneController.editInstance(
        async (sendIncrementalChange, instance) => {
          let changes;

          if (valueStream) {
            // Continuous changes (eg. slider drag)
            const orgValue = getNestedValue(instance, changePath);
            for await (const value of valueStream) {
              if (orgValue !== undefined) {
                setNestedValue(instance, changePath, orgValue); // Ensure getting the correct undo change
              } else {
                deleteNestedValue(instance, changePath);
              }
              changes = recordChanges(instance, (instance) => {
                setNestedValue(instance, changePath, value);
              });
              await sendIncrementalChange(changes.change, true); // true: "may drop"
            }
          } else {
            // Simple, atomic change
            changes = recordChanges(instance, (instance) => {
              setNestedValue(instance, changePath, value);
            });
          }

          const plen = changePath.length;
          const undoLabel =
            plen == 1
              ? `${changePath[plen - 1]}`
              : `${changePath[plen - 2]}.${changePath[plen - 1]}`;
          return {
            changes: changes,
            undoLabel: undoLabel,
            broadcast: true,
          };
        },
        this
      );
    };
  }
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
