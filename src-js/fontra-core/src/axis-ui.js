import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { scheduleCalls } from "@fontra/core/utils.js";
import {
  isLocationAtDefault,
  mapAxesFromUserSpaceToSourceSpace,
} from "@fontra/core/var-model.js";
import { showMenu } from "@fontra/web-components/menu-panel.js";
import {
  groupAccordionHeaderButtons,
  makeAccordionHeaderButton,
} from "@fontra/web-components/ui-accordion.js";

/*
 * Axis UI logic that is common between the editor view and the font overview.
 */

export function makeFontAxisAccordionItems(
  projectIdentifier,
  fontController,
  settingsController,
  accordion,
  sliderChangeHook
) {
  const settings = settingsController.model;

  const fontAxesAccordionItem = {
    id: "font-axes",
    label: translate("sidebar.designspace-navigation.font-axes"),
    open: true,
    content: html.createDomElement(
      "designspace-location",
      { id: "font-axes-ds-location", style: "height: 100%;" },
      []
    ),
    auxiliaryHeaderElement: groupAccordionHeaderButtons([
      makeAccordionHeaderButton({
        icon: "menu-2",
        id: "font-axes-view-options-button",
        tooltip: translate(
          "sidebar.designspace-navigation.font-axes-view-options-button.tooltip"
        ),
        onclick: (event) => showFontAxesViewOptionsMenu(settings, accordion, false),
      }),
      makeAccordionHeaderButton({
        icon: "tool",
        tooltip: translate("sidebar.designspace-navigation.font-axes.edit"),
        onclick: (event) => editFontAxes(projectIdentifier),
      }),
      makeAccordionHeaderButton({
        icon: "refresh",
        id: "reset-font-axes-button",
        tooltip: translate("sidebar.designspace-navigation.font-axes.reset"),
        onclick: (event) => resetAxes(fontController.axes.axes, settings, false),
      }),
    ]),
  };

  const hiddenFontAxesAccordionItem = {
    id: "hidden-font-axes",
    label: translate("sidebar.designspace-navigation.hidden-font-axes"),
    open: false,
    content: html.createDomElement(
      "designspace-location",
      { id: "hidden-font-axes-ds-location", style: "height: 100%;" },
      []
    ),
    auxiliaryHeaderElement: groupAccordionHeaderButtons([
      makeAccordionHeaderButton({
        icon: "menu-2",
        id: "hidden-font-axes-view-options-button",
        tooltip: translate(
          "sidebar.designspace-navigation.font-axes-view-options-button.tooltip"
        ),
        onclick: (event) => showFontAxesViewOptionsMenu(settings, accordion, true),
      }),
      makeAccordionHeaderButton({
        icon: "tool",
        tooltip: translate("sidebar.designspace-navigation.font-axes.edit"),
        onclick: (event) => editFontAxes(projectIdentifier),
      }),
      makeAccordionHeaderButton({
        icon: "refresh",
        id: "reset-hidden-font-axes-button",
        tooltip: translate("sidebar.designspace-navigation.font-axes.reset"),
        onclick: (event) => resetAxes(fontController.axes.axes, settings, true),
      }),
    ]),
  };

  let updateVisibleFontAxes, updateHiddenFontAxes;

  const updateFontAxes = () => {
    if (!updateVisibleFontAxes) {
      updateVisibleFontAxes = setupFontAxisSliders(
        fontController,
        settingsController,
        accordion,
        sliderChangeHook,
        false
      );

      updateHiddenFontAxes = setupFontAxisSliders(
        fontController,
        settingsController,
        accordion,
        sliderChangeHook,
        true
      );
    }

    updateVisibleFontAxes();
    updateHiddenFontAxes();
  };

  settingsController.addKeyListener(
    [
      "fontAxesUseSourceCoordinates",
      "fontAxesShowEffectiveLocation",
      "hiddenFontAxesShowEffectiveLocation",
      "fontAxesShowHidden",
      "fontAxesSkipMapping",
    ],
    (event) => updateFontAxes()
  );

  return { updateFontAxes, fontAxesAccordionItem, hiddenFontAxesAccordionItem };
}

function setupFontAxisSliders(
  fontController,
  settingsController,
  accordion,
  sliderChangeHook,
  forHiddenAxes = false
) {
  const settings = settingsController.model;
  const locationElement = accordion.querySelector(
    forHiddenAxes ? "#hidden-font-axes-ds-location" : "#font-axes-ds-location"
  );

  const filteredAxes = () => {
    return fontController.axes.axes.filter((axis) => !!axis.hidden === forHiddenAxes);
  };

  const locationKey = () =>
    settings.fontAxesUseSourceCoordinates ? "fontLocationSource" : "fontLocationUser";

  let axes, axesSourceSpace;

  const updateResetButtonState = scheduleCalls(() => {
    const button = accordion.querySelector(
      forHiddenAxes ? "#reset-hidden-font-axes-button" : "#reset-font-axes-button"
    );
    button.disabled = isLocationAtDefault(
      settings.fontLocationSourceMapped,
      axesSourceSpace
    );
  });

  const update = () => {
    axes = filteredAxes();
    axesSourceSpace = mapAxesFromUserSpaceToSourceSpace(axes);
    locationElement.axes = settings.fontAxesUseSourceCoordinates
      ? axesSourceSpace
      : axes;
    locationElement.phantomAxes = (
      forHiddenAxes
        ? settings.hiddenFontAxesShowEffectiveLocation
        : settings.fontAxesShowEffectiveLocation
    )
      ? axesSourceSpace
      : [];

    if (forHiddenAxes) {
      locationElement.onlyShowPhantomAxes =
        settings.hiddenFontAxesShowEffectiveLocation ==
        ShowLocationSettings.OnlyShowEffectiveLocation;
    }

    locationElement.values = filterLocation(settings[locationKey()], axes);
    locationElement.phantomValues = settings.fontLocationSourceMapped;

    updateResetButtonState();
    if (forHiddenAxes) {
      const hiddenAxesAccordionItem = accordion.querySelector("#hidden-font-axes");
      hiddenAxesAccordionItem.hidden = !axes.length;
    }
  };

  settingsController.addKeyListener(
    ["fontLocationUser", "fontLocationSource"],
    (event) => {
      if (!axes) {
        // called too early, initialisation not finished
        return;
      }
      if (!event.senderInfo?.sentFromSliders && event.key === locationKey()) {
        locationElement.values = filterLocation(event.newValue, axes);
      }
      locationElement.phantomValues = settings.fontLocationSourceMapped;
      updateResetButtonState();
    }
  );

  locationElement.addEventListener(
    "locationChanged",
    scheduleCalls((event) => {
      sliderChangeHook?.();
      settingsController.setItem(
        locationKey(),
        { ...settings[locationKey()], ...locationElement.values },
        { sentFromSliders: true }
      );
    })
  );

  fontController.addChangeListener({ axes: null }, (change, isExternalChange) => {
    update();
  });

  return update;
}

function showFontAxesViewOptionsMenu(settings, accordion, forHiddenAxes) {
  const button = accordion.querySelector(
    forHiddenAxes
      ? "#hidden-font-axes-view-options-button"
      : "#font-axes-view-options-button"
  );
  const buttonRect = button.getBoundingClientRect();

  const menuItems = getAxisOptionsMenuItems(settings, forHiddenAxes);

  showMenu(menuItems, { x: buttonRect.left, y: buttonRect.bottom });
}

function resetAxes(axes, settings, hiddenAxes) {
  settings.fontLocationUser = filterLocation(
    settings.fontLocationUser,
    axes.filter((axis) => !axis.hidden === hiddenAxes)
  );
}

export function setupLocationDependencies(fontController, settingsController) {
  // Set up the dependencies between fontLocationUser, fontLocationSource and
  // fontLocationSourceMapped

  const settings = settingsController.model;

  const locationDependencies = [
    [
      "fontLocationUser",
      "fontLocationSource",
      "mapUserLocationToSourceLocation",
      false,
    ],
    [
      "fontLocationSource",
      "fontLocationUser",
      "mapSourceLocationToUserLocation",
      false,
    ],
    [
      "fontLocationSource",
      "fontLocationSourceMapped",
      "mapSourceLocationToMappedSourceLocation",
      true,
    ],
    [
      "fontLocationSourceMapped",
      "fontLocationSource",
      "mapMappedSourceLocationToSourceLocation",
      true,
    ],
  ];

  for (const [
    sourceKey,
    destinationKey,
    mapMethodName,
    maySkip,
  ] of locationDependencies) {
    const mapMethod = fontController[mapMethodName].bind(fontController);

    settingsController.addKeyListener(
      sourceKey,
      (event) => {
        if (event.senderInfo?.senderStack?.includes(destinationKey)) {
          return;
        }

        const mapFunc =
          maySkip && settings.fontAxesSkipMapping ? (loc) => loc : mapMethod;

        settingsController.setItem(destinationKey, mapFunc(event.newValue), {
          senderStack: (event.senderInfo?.senderStack || []).concat([
            sourceKey,
            destinationKey,
          ]),
        });
      },
      true
    );
  }

  // Trigger recalculating the mapped location
  settingsController.addKeyListener("fontAxesSkipMapping", (event) => {
    settings.fontLocationSource = {
      ...settings.fontLocationSource,
    };
  });

  fontController.addChangeListener({ axes: null }, (change, isExternalChange) => {
    // the CrossAxisMapping may have changed, force to re-sync the location
    settings.fontLocationSource = {
      ...settings.fontLocationSource,
    };
  });
}

function filterLocation(location, axes) {
  const filteredLocation = {};

  for (const axis of axes) {
    const value = location[axis.name];
    if (value !== undefined) {
      filteredLocation[axis.name] = value;
    }
  }

  return filteredLocation;
}

export const ShowLocationSettings = Object.freeze({
  DontShowEffectiveLocation: 0,
  ShowEffectiveLocation: 1,
  OnlyShowEffectiveLocation: 2,
});

function getAxisOptionsMenuItems(settings, forHiddenAxes) {
  const effectiveLocationKey = forHiddenAxes
    ? "hiddenFontAxesShowEffectiveLocation"
    : "fontAxesShowEffectiveLocation";
  const menuItems = [
    {
      title: translate(
        "sidebar.designspace-navigation.font-axes-view-options-menu.apply-single-axis-mapping"
      ),
      callback: () => {
        settings.fontAxesUseSourceCoordinates = !settings.fontAxesUseSourceCoordinates;
      },
      checked: !settings.fontAxesUseSourceCoordinates,
    },
    {
      title: translate(
        "sidebar.designspace-navigation.font-axes-view-options-menu.apply-cross-axis-mapping"
      ),
      callback: () => {
        settings.fontAxesSkipMapping = !settings.fontAxesSkipMapping;
      },
      checked: !settings.fontAxesSkipMapping,
    },
    { title: "-" },
    {
      title: translate(
        "sidebar.designspace-navigation.font-axes-view-options-menu.show-effective-location"
      ),
      callback: () => {
        settings[effectiveLocationKey] =
          settings[effectiveLocationKey] == ShowLocationSettings.ShowEffectiveLocation
            ? ShowLocationSettings.DontShowEffectiveLocation
            : ShowLocationSettings.ShowEffectiveLocation;
      },
      checked:
        settings[effectiveLocationKey] == ShowLocationSettings.ShowEffectiveLocation,
    },
  ];

  if (forHiddenAxes) {
    menuItems.push({
      title: translate(
        "sidebar.designspace-navigation.font-axes-view-options-menu.show-only-effective-location"
      ),
      callback: () => {
        settings[effectiveLocationKey] =
          settings[effectiveLocationKey] ==
          ShowLocationSettings.OnlyShowEffectiveLocation
            ? ShowLocationSettings.DontShowEffectiveLocation
            : ShowLocationSettings.OnlyShowEffectiveLocation;
      },
      checked:
        settings[effectiveLocationKey] ==
        ShowLocationSettings.OnlyShowEffectiveLocation,
    });
  }

  return menuItems;
}

function editFontAxes(projectIdentifier) {
  const url = new URL(window.location);
  url.pathname = url.pathname.replace(/\/[^.]+\.html/, "/fontinfo.html");
  url.hash = "#axes-panel";
  window.open(url.toString(), `fontra.fontinfo.${projectIdentifier}`);
}

export function setShowEffectiveLocationDefaults(fontController, settings) {
  // If for each of the sets of non-hidden and hidden axes there exists a
  // cross-axis mapping that influences it, activate "ShowEffectiveLocation"
  // by default (used in panel-designspace-navigation.js)
  for (const [key, hidden] of [
    ["fontAxesShowEffectiveLocation", false],
    ["hiddenFontAxesShowEffectiveLocation", true],
  ]) {
    const axisNames = new Set(
      fontController.fontAxes
        .filter((axis) => !!axis.hidden == hidden)
        .map((axis) => axis.name)
    );
    if (
      fontController.axes.mappings.some(({ outputLocation }) =>
        Object.keys(outputLocation).some((key) => axisNames.has(key))
      )
    ) {
      settings[key] = ShowLocationSettings.ShowEffectiveLocation;
    }
  }
}
