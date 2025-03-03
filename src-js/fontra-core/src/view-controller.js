import { ensureLanguageHasLoaded } from "@fontra/core/localization.js";
import { dialogSetup, message } from "@fontra/web-components/modal-dialog.js";
import { registerAction } from "./actions.js";
import { Backend } from "./backend-api.js";
import { FontController } from "./font-controller.js";
import { getRemoteProxy } from "./remote.js";

export class ViewController {
  static titlePattern(displayName) {
    return `Fontra — ${displayName}`;
  }

  static displayName(projectIdentifier) {
    // TODO: this should be delegated to the project manager, which should then
    // properly maintain a (user editable) "display name" for a project.
    //
    // For now, just shorten the projectIdentifier in case it is long and contains
    // slash characters.
    const displayNameItems = projectIdentifier.split("/");
    let displayName = displayNameItems.join("/");
    while (displayNameItems.length > 2 && displayName.length > 60) {
      displayNameItems.splice(0, 1);
      displayName = ["...", ...displayNameItems].join("/");
    }
    return displayName;
  }

  static async fromBackend() {
    const projectIdentifier = new URL(window.location).searchParams.get("project");
    const displayName = this.displayName(projectIdentifier);
    document.title = this.titlePattern(displayName);

    await ensureLanguageHasLoaded;

    const remoteFontEngine = await Backend.remoteFont(projectIdentifier);
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
    controller.afterStart();
    return controller;
  }

  constructor(font) {
    this.fontController = new FontController(font);

    document.addEventListener("visibilitychange", (event) => {
      if (this._reconnectDialog) {
        if (document.visibilityState === "visible") {
          this._reconnectDialog.cancel();
        } else {
          this._reconnectDialog.hide();
        }
      }
    });
  }

  async start() {
    await this.fontController.initialize();
  }

  afterStart() {
    for (const format of this.fontController.backendInfo.projectManagerFeatures[
      "export-as"
    ] || []) {
      registerAction(
        `action.export-as.${format}`,
        {
          topic: "0035-action-topics.export-as",
        },
        (event) => this.fontController.exportAs({ format })
      );
    }
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
  async reloadData(reloadPattern) {
    if (!reloadPattern) {
      // A reloadPattern of undefined or null means: reload all the things
      await this.reloadEverything();
      return;
    }

    for (const rootKey of Object.keys(reloadPattern)) {
      if (rootKey == "glyphs") {
        const glyphNames = Object.keys(reloadPattern["glyphs"] || {});
        if (glyphNames.length) {
          await this.reloadGlyphs(glyphNames);
        }
      } else {
        // TODO
        // console.log(`reloading of non-glyph data is not yet implemented: ${rootKey}`);
        await this.reloadEverything();
        return;
      }
    }
  }

  /* called by reloadData */
  async reloadEverything() {
    await this.fontController.reloadEverything();
  }

  /* called by reloadData */
  async reloadGlyphs(glyphNames) {
    await this.fontController.reloadGlyphs(glyphNames);
  }

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

  async handleRemoteClose(event) {
    this._reconnectDialog = await dialogSetup(
      "Connection closed", // TODO: translation
      "The connection to the server closed unexpectedly.",
      [{ title: "Reconnect", resultValue: "ok" }]
    );
    const result = await this._reconnectDialog.run();
    delete this._reconnectDialog;

    if (!result && location.hostname === "localhost") {
      // The dialog was cancelled by the "wake" event handler
      // Dubious assumption:
      // Running from localhost most likely means were looking at local data,
      // which unlikely changed while we were away. So let's not bother reloading
      // anything.
      return;
    }

    if (this.fontController.font.websocket.readyState > 1) {
      // The websocket isn't currently working, let's try to do a page reload
      location.reload();
      return;
    }

    // Reload only the data, not the UI (the page)
    const reloadPattern = { glyphs: {} };
    const glyphReloadPattern = reloadPattern.glyphs;
    for (const glyphName of this.fontController.getCachedGlyphNames()) {
      glyphReloadPattern[glyphName] = null;
    }
    // TODO: fix reloadData so we can do this:
    //   reloadPattern["glyphMap"] = null; // etc.
    // so we won't have to re-initialize the font controller to reload
    // all non-glyph data:
    await this.fontController.initialize();
    await this.reloadData(reloadPattern);
  }

  async handleRemoteError(event) {
    console.log("remote error", event);
    await dialog(
      "Connection problem", // TODO: translation
      `There was a problem with the connection to the server.
      See the JavaScript Console for details.`,
      [{ title: "Reconnect", resultValue: "ok" }]
    );
    location.reload();
  }
}
