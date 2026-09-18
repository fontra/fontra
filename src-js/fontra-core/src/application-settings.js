import { ObservableController } from "./observable-object.ts";

export const applicationSettingsController = new ObservableController({
  clipboardFormat: "glif",
  rectSelectLiveModifierKeys: false,
  glyphSourcesSortOptions: "by-axis-value",
  alwaysShowGlobalAxesInComponentLocation: false,
  sortComponentLocationGlyphAxes: true,
  disableAdHocMarks: false,
  shapingDebuggerShowIneffectiveItems: false,
  outputGlyphsShowKerningForAdvance: true,
  arrowKeyNudgeValue: 1,
  arrowKeyNudgeValueShift: 10,
  arrowKeyNudgeValueShiftControl: 100,
});

applicationSettingsController.synchronizeWithLocalStorage(
  "fontra-application-settings-"
);
