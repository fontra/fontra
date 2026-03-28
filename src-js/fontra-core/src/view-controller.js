import * as html from "@fontra/core/html-utils.js";
import { ensureLanguageHasLoaded } from "@fontra/core/localization.js";
import { dialog, dialogSetup, message } from "@fontra/web-components/modal-dialog.js";
import { registerAction } from "./actions.js";
import { Backend } from "./backend-api.js";
import { RemoteError } from "./errors.js";
import { FontController } from "./font-controller.js";
import { getRemoteProxy } from "./remote.js";

export class ViewController {
  static titlePattern(displayName) {
    return `Fontra — ${displayName}`;
  }

  static async fromBackend() {
    const projectIdentifier = new URL(window.location).searchParams.get("project");

    await ensureLanguageHasLoaded;

    const remoteFontEngine = await Backend.remoteFont(projectIdentifier);
    const controller = new this(remoteFontEngine, projectIdentifier);
    remoteFontEngine.on("close", (event) => controller.handleRemoteClose(event));
    remoteFontEngine.on("error", (event) => controller.handleRemoteError(event));
    remoteFontEngine.on("initializationError", (error) =>
      controller.handleInitializationError(error)
    );
    remoteFontEngine.on("messageFromServer", (headline, msg) =>
      controller.messageFromServer(headline, msg)
    );
    remoteFontEngine.on("externalChange", (change, isLiveChange) =>
      controller.externalChange(change, isLiveChange)
    );
    remoteFontEngine.on("reloadData", (reloadPattern) =>
      controller.reloadData(reloadPattern)
    );
    remoteFontEngine.on("reconnect", () => controller.onReconnect());

    try {
      await controller.start();
      controller.afterStart();
    } catch (e) {
      console.log(e);
    }
    return controller;
  }

  constructor(font, projectIdentifier) {
    this.fontController = new FontController(font);
    this.projectIdentifier = projectIdentifier;

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
    try {
      await this.fontController.initialize();
    } catch (e) {
      const err = e instanceof RemoteError ? e.message : e.toString();
      this.handleInitializationError(err);
      throw e;
    }
  }

  afterStart() {
    const projectName = this.fontController.metaInfo.projectName;
    document.title = this.constructor.titlePattern(projectName);

    const topBar = document.querySelector(".top-bar-container");
    topBar?.appendChild(html.div({ id: "fontra-project-name" }, [projectName]));

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

  /* this is called when a connection has been established again, after a disconnect */
  async onReconnect() {
    const { subscriptionPattern, liveSubscriptionPattern } =
      this.getSubscriptionPatterns();
    if (subscriptionPattern) {
      await this.fontController.subscribeChanges(subscriptionPattern, false);
    }
    if (liveSubscriptionPattern) {
      await this.fontController.subscribeChanges(liveSubscriptionPattern, true);
    }
  }

  /* gets called from onReconnect(), can be overridden by subclass */
  getSubscriptionPatterns() {
    return {};
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
    if (this._ignoreClose) {
      // See handleInitializationError
      return;
    }

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

  async handleInitializationError(error) {
    this._ignoreClose = true;
    await dialog(
      "Initialization problem", // TODO: translation
      `There was a problem loading the data:\n\n${error}`,
      [{ title: "Try again", resultValue: "ok" }]
    );
    location.reload();
  }
}
