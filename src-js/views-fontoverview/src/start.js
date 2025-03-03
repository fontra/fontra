import "@fontra/core/theme-settings.js";

import { FontOverviewController } from "@fontra/views-fontoverview/fontoverview.js";

async function startApp() {
  window.fontOverviewController = await FontOverviewController.fromBackend();
}

startApp();
