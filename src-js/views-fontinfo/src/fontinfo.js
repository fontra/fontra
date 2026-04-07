import { registerActionCallbacks } from "@fontra/core/actions.js";
import { makeFontraMenuBar } from "@fontra/core/fontra-menus.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { MultiPanelController } from "@fontra/core/multi-panel.js";
import { ViewController } from "@fontra/core/view-controller.js";
import { AxesPanel } from "./panel-axes.js";
import { CrossAxisMappingPanel } from "./panel-cross-axis-mapping.js";
import { DevelopmentStatusDefinitionsPanel } from "./panel-development-status-definitions.js";
import { FontInfoPanel } from "./panel-font-info.js";
import { OpenTypeFeatureCodePanel } from "./panel-opentype-feature-code.js";
import { SourcesPanel } from "./panel-sources.js";

const panelClasses = [
  FontInfoPanel,
  AxesPanel,
  SourcesPanel,
  OpenTypeFeatureCodePanel,
  CrossAxisMappingPanel,
  DevelopmentStatusDefinitionsPanel,
];

export class FontInfoController extends ViewController {
  static titlePattern(displayName) {
    return `Fontra Font Info — ${displayName}`;
  }

  async start() {
    await super.start();

    this.initActions();

    const myMenuBar = makeFontraMenuBar(["File", "Edit", "Font"], this);
    document.querySelector(".top-bar-container").appendChild(myMenuBar);

    this.multiPanelController = new MultiPanelController(
      panelClasses,
      this,
      "font-info"
    );

    const { subscriptionPattern } = this.getSubscriptionPatterns();
    await this.fontController.subscribeChanges(subscriptionPattern, false);

    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
  }

  getSubscriptionPatterns() {
    const subscriptionPattern = {};
    for (const panelClass of panelClasses) {
      panelClass.fontAttributes.forEach((fontAttr) => {
        subscriptionPattern[fontAttr] = null;
      });
    }
    return { subscriptionPattern };
  }

  handleKeyDown(event) {
    this.multiPanelController.selectedPanel?.handleKeyDown?.(event);
  }

  initActions() {
    registerActionCallbacks(
      "action.undo",
      () => this.doUndoRedo(false),
      () => this.canUndoRedo(false),
      () => this.getUndoRedoLabel(false)
    );

    registerActionCallbacks(
      "action.redo",
      () => this.doUndoRedo(true),
      () => this.canUndoRedo(true),
      () => this.getUndoRedoLabel(true)
    );
  }

  getUndoRedoLabel(isRedo) {
    return this.multiPanelController.selectedPanel?.getUndoRedoLabel(isRedo);
  }

  canUndoRedo(isRedo) {
    return this.multiPanelController.selectedPanel?.canUndoRedo(isRedo);
  }

  doUndoRedo(isRedo) {
    return this.multiPanelController.selectedPanel?.doUndoRedo(isRedo);
  }
}
