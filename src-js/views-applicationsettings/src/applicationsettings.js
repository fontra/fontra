import { makeFontraMenuBar } from "@fontra/core/fontra-menus.js";
import * as html from "@fontra/core/html-utils.js";
import { ensureLanguageHasLoaded, translate } from "@fontra/core/localization.js";
import { MultiPanelController } from "@fontra/core/multi-panel.js";
import "@fontra/web-components/grouped-settings.js";
import { message } from "@fontra/web-components/modal-dialog.js";
import "@fontra/web-components/plugin-manager.js";
import { ClipboardPanel } from "./panel-clipboard.js";
import { DisplayLanguagePanel } from "./panel-display-language.js";
import { EditorBehaviorPanel } from "./panel-editor-behavior.js";
import { PluginsManagerPanel } from "./panel-plugins-manager.js";
import { ServerInfoPanel } from "./panel-server-info.js";
import { ShortCutsPanel } from "./panel-shortcuts.js";
import { ThemeSettingsPanel } from "./panel-theme-settings.js";

const panelClasses = [
  ShortCutsPanel,
  ThemeSettingsPanel,
  DisplayLanguagePanel,
  ClipboardPanel,
  EditorBehaviorPanel,
  PluginsManagerPanel,
  ServerInfoPanel,
];

export class ApplicationSettingsController {
  async start() {
    await ensureLanguageHasLoaded;

    const myMenuBar = makeFontraMenuBar(["File"], this);
    document.querySelector(".top-bar-container").appendChild(myMenuBar);

    this.multiPanelController = new MultiPanelController(
      panelClasses,
      this,
      "application-settings"
    );

    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
  }

  handleKeyDown(event) {
    this.multiPanelController.selectedPanel?.handleKeyDown?.(event);
  }
}
