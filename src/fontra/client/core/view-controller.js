import { Backend } from "./backend-api.js";
import { FontController } from "./font-controller.js";
import { getRemoteProxy } from "./remote.js";
import { makeDisplayPath } from "./view-utils.js";
import { ensureLanguageHasLoaded, translate } from "/core/localization.js";
import { MenuBar } from "/web-components/menu-bar.js";
import { MenuItemDivider } from "/web-components/menu-panel.js";
import { message } from "/web-components/modal-dialog.js";

export class ViewController {
  static titlePattern(displayPath) {
    return `Fontra — ${decodeURI(displayPath)}`;
  }
  static async fromBackend() {
    const pathItems = window.location.pathname.split("/").slice(3);
    const displayPath = makeDisplayPath(pathItems);
    document.title = this.titlePattern(displayPath);
    const projectPath = pathItems.join("/");

    await ensureLanguageHasLoaded;

    const remoteFontEngine = await Backend.remoteFont(projectPath);
    const controller = new this(remoteFontEngine);
    remoteFontEngine.on("close", (event) => controller.handleRemoteClose(event));
    remoteFontEngine.on("error", (event) => controller.handleRemoteError(event));
    remoteFontEngine.on("messageFromServer", (headline, msg) =>
      controller.messageFromServer(headline, msg)
    );
    remoteFontEngine.on("externalChange", (change, isLiveChange) =>
      controller.externalChange(change, isLiveChange)
    );
    remoteFontEngine.on("reloadData", (reloadPattern) =>
      controller.reloadData(reloadPattern)
    );

    await controller.start();
    return controller;
  }

  constructor(font) {
    this.fontController = new FontController(font);
  }

  async start() {
    console.error("ViewController.start() not implemented");
  }

  /**
   * The following methods are called by the remote object, on receipt of a
   * method call from the backend.
   */

  /**
   * Apply a change from the backend.
   *
   * Something happened to the current font outside of this controller, and we
   * need to change ourselves in order to reflect that change.
   *
   * @param {*} change
   * @param {*} isLiveChange
   */

  async externalChange(change, isLiveChange) {
    await this.fontController.applyChange(change, true);
    this.fontController.notifyChangeListeners(change, isLiveChange, true);
  }

  /**
   * Reload some part of the font
   *
   * This is called when the backend tells us that something has changed, and
   * we need to reload the font to reflect that change.
   *
   * @param {*} reloadPattern
   */
  async reloadData(reloadPattern) {}

  /**
   *
   * Notify the user of a message from the server.
   *
   * @param {*} headline
   * @param {*} msg
   */
  async messageFromServer(headline, msg) {
    // don't await the dialog result, the server doesn't need an answer
    message(headline, msg);
  }

  handleRemoteClose(event) {
    //
  }

  handleRemoteError(event) {
    //
  }

  initTopBar() {
    const menuBar = new MenuBar([
      {
        title: "Fontra",
        bold: true,
        getItems: () => {
          const menuItems = [
            "shortcuts",
            "theme-settings",
            "display-language",
            "clipboard",
            "editor-behavior",
            "plugins-manager",
            "server-info",
          ];
          return menuItems.map((panelID) => ({
            title: translate(`application-settings.${panelID}.title`),
            enabled: () => true,
            callback: () => {
              window.open(
                `/applicationsettings/applicationsettings.html#${panelID}-panel`
              );
            },
          }));
        },
      },
      {
        title: translate("menubar.file"),
        getItems: () => {
          let exportFormats =
            this.fontController.backendInfo.projectManagerFeatures["export-as"] || [];
          if (exportFormats.length > 0) {
            return [
              {
                title: translate("menubar.file.export-as"),
                getItems: () =>
                  exportFormats.map((format) => ({
                    actionIdentifier: `action.export-as.${format}`,
                  })),
              },
            ];
          } else {
            return [
              {
                title: translate("menubar.file.new"),
                enabled: () => false,
                callback: () => {},
              },
              {
                title: translate("menubar.file.open"),
                enabled: () => false,
                callback: () => {},
              },
            ];
          }
        },
      },
      {
        title: translate("menubar.edit"),
        getItems: () => {
          const menuItems = [...this.basicContextMenuItems];
          if (this.sceneSettings.selectedGlyph?.isEditing) {
            this.sceneController.updateContextMenuState(event);
            menuItems.push(MenuItemDivider);
            menuItems.push(...this.glyphEditContextMenuItems);
          }
          return menuItems;
        },
      },
      {
        title: translate("menubar.view"),
        getItems: () => {
          const items = [
            {
              actionIdentifier: "action.zoom-in",
            },
            {
              actionIdentifier: "action.zoom-out",
            },
            {
              actionIdentifier: "action.zoom-fit-selection",
            },
          ];

          if (typeof this.sceneModel.selectedGlyph !== "undefined") {
            this.sceneController.updateContextMenuState();
            items.push(MenuItemDivider);
            items.push(...this.glyphSelectedContextMenuItems);
          }

          items.push(MenuItemDivider);
          items.push({
            title: translate("action-topics.glyph-editor-appearance"),
            getItems: () => {
              const layerDefs = this.visualizationLayers.definitions.filter(
                (layer) => layer.userSwitchable
              );

              return layerDefs.map((layerDef) => {
                return {
                  actionIdentifier: `actions.glyph-editor-appearance.${layerDef.identifier}`,
                  checked: this.visualizationLayersSettings.model[layerDef.identifier],
                };
              });
            },
          });

          return items;
        },
      },
      {
        title: translate("menubar.font"),
        enabled: () => true,
        getItems: () => {
          const menuItems = [
            [translate("font-info.title"), "#font-info-panel", true],
            [translate("axes.title"), "#axes-panel", true],
            [translate("cross-axis-mapping.title"), "#cross-axis-mapping-panel", true],
            [translate("sources.title"), "#sources-panel", true],
            [
              translate("development-status-definitions.title"),
              "#development-status-definitions-panel",
              true,
            ],
          ];
          return menuItems.map(([title, panelID, enabled]) => ({
            title,
            enabled: () => enabled,
            callback: () => {
              const url = new URL(window.location);
              url.pathname = url.pathname.replace("/editor/", "/fontinfo/");
              url.hash = panelID;
              window.open(url.toString());
            },
          }));
        },
      },
      {
        title: translate("menubar.glyph"),
        enabled: () => true,
        getItems: () => [
          { actionIdentifier: "action.glyph.add-source" },
          { actionIdentifier: "action.glyph.delete-source" },
          { actionIdentifier: "action.glyph.edit-glyph-axes" },
          MenuItemDivider,
          { actionIdentifier: "action.glyph.add-background-image" },
        ],
      },
      // // Disable for now, as the font overview isn't yet minimally feature-complete
      // {
      //   title: translate("menubar.window"),
      //   enabled: () => true,
      //   getItems: () => {
      //     return [
      //       {
      //         title: translate("font-overview.title"),
      //         enabled: () => true,
      //         callback: () => {
      //           const url = new URL(window.location);
      //           url.pathname = url.pathname.replace("/editor/", "/fontoverview/");
      //           url.hash = ""; // remove any hash
      //           window.open(url.toString());
      //         },
      //       },
      //     ];
      //   },
      // },
      {
        title: translate("menubar.help"),
        enabled: () => true,
        getItems: () => {
          return [
            {
              title: translate("menubar.help.homepage"),
              enabled: () => true,
              callback: () => {
                window.open("https://fontra.xyz/");
              },
            },
            {
              title: translate("menubar.help.documentation"),
              enabled: () => true,
              callback: () => {
                window.open("https://docs.fontra.xyz");
              },
            },
            {
              title: translate("menubar.help.changelog"),
              enabled: () => true,
              callback: () => {
                window.open("https://fontra.xyz/changelog.html");
              },
            },
            {
              title: "GitHub",
              enabled: () => true,
              callback: () => {
                window.open("https://github.com/googlefonts/fontra");
              },
            },
          ];
        },
      },
    ]);
    document.querySelector(".top-bar-container").appendChild(menuBar);
  }
}
