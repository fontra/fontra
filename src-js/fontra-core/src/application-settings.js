import { ObservableController } from "./observable-object.js";

export const applicationSettingsController = new ObservableController({
  clipboardFormat: "glif",
  rectSelectLiveModifierKeys: false,
  glyphSourcesSortOptions: "by-axis-value",
  alwaysShowGlobalAxesInComponentLocation: false,
});

applicationSettingsController.synchronizeWithLocalStorage(
  "fontra-application-settings-"
);
