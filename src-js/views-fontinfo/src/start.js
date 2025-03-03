import "@fontra/core/theme-settings.js";

import { FontInfoController } from "@fontra/views-fontinfo/fontinfo.js";

async function startApp() {
  window.fontInfoController = await FontInfoController.fromBackend();
}

startApp();
