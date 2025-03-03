import "@fontra/core/theme-settings.js";

import { ApplicationSettingsController } from "@fontra/views-applicationsettings/applicationsettings.js";

async function startApp() {
  window.applicationSettingsController = new ApplicationSettingsController();
  await window.applicationSettingsController.start();
}

startApp();
