import {
  makeFontAxisAccordionItems,
  setShowEffectiveLocationDefaults,
} from "@fontra/core/axis-ui.js";
import { groupByKeys, groupByProperties } from "@fontra/core/glyph-organizer.js";
import {
  CheckboxGroup,
  getGlyphSetsUIControllers,
  glyphSetsUIStyles,
} from "@fontra/core/glyphsets-ui.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { ObservableController } from "@fontra/core/observable-object.ts";
import { difference, symmetricDifference, union } from "@fontra/core/set-ops.js";
import { popupSelect } from "@fontra/core/ui-utils.js";
import { scheduleCalls, sleepAsync } from "@fontra/core/utils.ts";
import { DesignspaceLocation } from "@fontra/web-components/designspace-location.js";
import { GlyphSearchField } from "@fontra/web-components/glyph-search-field.js";
import { showMenu } from "@fontra/web-components/menu-panel.js";
import {
  Accordion,
  groupAccordionHeaderButtons,
  makeAccordionHeaderButton,
} from "@fontra/web-components/ui-accordion.js";

export class FontOverviewNavigation extends HTMLElement {
  constructor(fontOverviewController) {
    super();

    this.fontController = fontOverviewController.fontController;
    this.fontOverviewSettingsController =
      fontOverviewController.fontOverviewSettingsController;
    this.fontOverviewSettings = this.fontOverviewSettingsController.model;

    this.projectIdentifier = fontOverviewController.projectIdentifier;

    this._setupUI();
  }

  async _setupUI() {
    setShowEffectiveLocationDefaults(this.fontController, this.fontOverviewSettings);
    this.appendChild(
      new GlyphSearchField({
        settingsController: this.fontOverviewSettingsController,
        searchStringKey: "searchString",
      })
    );

    this.groupByCheckboxGroup = new CheckboxGroup(
      this.fontOverviewSettingsController,
      "groupByKeys"
    );

    [this.projectGlyphSets, this.myGlyphSets] = getGlyphSetsUIControllers(
      this.fontOverviewSettingsController,
      "panel-navigation-accordion"
    );

    const accordion = new Accordion();
    this.accordion = accordion;

    accordion.id = "panel-navigation-accordion";

    accordion.appendStyle(
      `
      #font-source-location-container {
        display: grid;
        gap: 0.5em;
      }
    ` + glyphSetsUIStyles
    );

    accordion.onItemOpenClose = (item, openClose) => {
      const setOp = openClose ? difference : union;
      this.fontOverviewSettingsController.setItem(
        "closedNavigationSections",
        setOp(this.fontOverviewSettings.closedNavigationSections, [item.id]),
        { sentFromUserClick: true }
      );
    };

    this.fontOverviewSettingsController.addKeyListener(
      "closedNavigationSections",
      (event) => {
        if (!event.senderInfo?.sentFromUserClick) {
          const diff = symmetricDifference(event.newValue, event.oldValue);
          for (const id of diff) {
            const item = accordion.items.find((item) => item.id == id);
            accordion.openCloseAccordionItem(item, !event.newValue.has(id));
          }
        }
      }
    );

    const { updateFontAxes, fontAxesAccordionItem, hiddenFontAxesAccordionItem } =
      makeFontAxisAccordionItems(
        this.projectIdentifier,
        this.fontController,
        this.fontOverviewSettingsController,
        accordion
      );

    const accordionItems = [
      {
        label: translate("font-overview.popup.source"),
        id: "location",
        content: html.div({ id: "font-source-location-container" }, [
          await this._makeFontSourcePopup(),
        ]),
      },
      fontAxesAccordionItem,
      hiddenFontAxesAccordionItem,
      {
        label: translate("glyph-organizing.group-by"),
        id: "group-by",
        content: this.groupByCheckboxGroup.makeCheckboxUI(groupByProperties),
      },
      this.projectGlyphSets.accordionItem,
      this.myGlyphSets.accordionItem,
    ];

    accordionItems.forEach(
      (item) =>
        (item.open = !this.fontOverviewSettings.closedNavigationSections.has(item.id))
    );

    accordion.items = accordionItems;

    this.appendChild(
      html.div({ class: "font-overview-navigation-section" }, [accordion])
    );

    await sleepAsync(0);
    updateFontAxes();
  }

  async _makeFontSourcePopup() {
    const fontSources = await this.fontController.getSources();
    const popupItems = [];

    const selectedSourceIdentifier = () =>
      this.fontController.fontSourcesInstancer.getSourceIdentifierForLocation(
        this.fontOverviewSettings.fontLocationSource
      );

    const updatePopupItems = () => {
      popupItems.splice(
        0,
        popupItems.length,
        ...this.fontController
          .getSortedSourceIdentifiers()
          .map((fontSourceIdentifier) => ({
            value: fontSourceIdentifier,
            label: fontSources[fontSourceIdentifier].name,
          }))
      );
    };

    updatePopupItems();

    const controller = new ObservableController({
      value: selectedSourceIdentifier(),
    });

    this.fontOverviewSettingsController.addKeyListener(
      "fontLocationSource",
      (event) => {
        if (!event.senderInfo?.sentFromInput) {
          controller.setItem("value", selectedSourceIdentifier(), {
            sentFromSourceLocationListener: true,
          });
        }
      }
    );

    controller.addKeyListener("value", (event) => {
      const fontSourceIdentifier = event.newValue;
      const sourceLocation = fontSources[fontSourceIdentifier]?.location;
      if (sourceLocation && !event.senderInfo?.sentFromSourceLocationListener) {
        this.fontOverviewSettingsController.setItem(
          "fontLocationSource",
          { ...sourceLocation },
          { sentFromInput: true }
        );
      }
    });

    this.fontController.addChangeListener(
      { sources: null },
      (change, isExternalChange) => {
        updatePopupItems();
        // Trigger *label* refresh. The *value* may not have changed, so we'll
        // briefly set it to null to ensure the listeners get triggered
        controller.model.value = null;
        controller.model.value = selectedSourceIdentifier();
      }
    );

    return popupSelect(controller, "value", popupItems);
  }
}

customElements.define("font-overview-navigation", FontOverviewNavigation);
