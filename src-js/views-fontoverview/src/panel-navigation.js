import { groupByKeys, groupByProperties } from "@fontra/core/glyph-organizer.js";
import {
  CheckboxGroup,
  GlyphSetsUIController,
  glyphSetsUIStyles,
} from "@fontra/core/glyphsets-ui.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { ObservableController } from "@fontra/core/observable-object.js";
import { difference, symmetricDifference, union } from "@fontra/core/set-ops.js";
import { popupSelect } from "@fontra/core/ui-utils.js";
import { scheduleCalls } from "@fontra/core/utils.js";
import { DesignspaceLocation } from "@fontra/web-components/designspace-location.js";
import { GlyphSearchField } from "@fontra/web-components/glyph-search-field.js";
import { Accordion } from "@fontra/web-components/ui-accordion.js";

export class FontOverviewNavigation extends HTMLElement {
  constructor(fontOverviewController) {
    super();

    this.fontController = fontOverviewController.fontController;
    this.fontOverviewSettingsController =
      fontOverviewController.fontOverviewSettingsController;
    this.fontOverviewSettings = this.fontOverviewSettingsController.model;

    this._setupUI();
  }

  async _setupUI() {
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
    this.projectGlyphSets = new GlyphSetsUIController(
      this.fontOverviewSettingsController,
      {
        label: "Project glyph sets", // TODO: translate
        id: "project-glyph-sets",
        collectionKey: "projectGlyphSets",
        selectionKey: "projectGlyphSetSelection",
        addGlyphSetToolTip: "Add a glyph set to the project",
        copyToLabel: "my glyph sets",
        otherCollectionKey: "myGlyphSets",
        accordionId: "panel-navigation-accordion",
      }
    );
    this.myGlyphSets = new GlyphSetsUIController(this.fontOverviewSettingsController, {
      label: "My glyph sets", // TODO: translate
      id: "my-glyph-sets",
      collectionKey: "myGlyphSets",
      selectionKey: "myGlyphSetSelection",
      addGlyphSetToolTip: "Add a glyph set to my sets",
      copyToLabel: "project glyph sets",
      otherCollectionKey: "projectGlyphSets",
      accordionId: "panel-navigation-accordion",
    });

    const accordion = new Accordion();
    this.accordion = accordion;

    accordion.id = "panel-navigation-accordion";

    accordion.appendStyle(
      `
      .font-source-location-container {
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

    const accordionItems = [
      {
        label: translate("sources.labels.location"),
        id: "location",
        content: html.div({ class: "font-source-location-container" }, [
          await this._makeFontSourcePopup(),
          this._makeFontSourceSliders(),
        ]),
      },
      {
        label: "Group by", // TODO: translate
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

  _makeFontSourceSliders() {
    const locationElement = new DesignspaceLocation();
    locationElement.axes = this.fontController.axes.axes;
    locationElement.values = { ...this.fontOverviewSettings.fontLocationUser };

    this.fontOverviewSettingsController.addKeyListener("fontLocationUser", (event) => {
      if (!event.senderInfo?.sentFromSliders) {
        locationElement.values = { ...event.newValue };
      }
    });

    locationElement.addEventListener(
      "locationChanged",
      scheduleCalls((event) => {
        this.fontOverviewSettingsController.setItem(
          "fontLocationUser",
          { ...locationElement.values },
          { sentFromSliders: true }
        );
      })
    );

    this.fontController.addChangeListener(
      { axes: null },
      (change, isExternalChange) => {
        locationElement.axes = this.fontController.axes.axes;
        locationElement.values = { ...this.fontOverviewSettings.fontLocationUser };
      }
    );

    return locationElement;
  }
}

customElements.define("font-overview-navigation", FontOverviewNavigation);
