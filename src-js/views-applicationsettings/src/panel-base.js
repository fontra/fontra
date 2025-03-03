export class BaseInfoPanel {
  constructor(applicationSettingsController, panelElement) {
    this.applicationSettingsController = applicationSettingsController;
    this.panelElement = panelElement;
  }

  visibilityChanged(onOff) {
    this.visible = onOff;
    if (onOff && !this.initialized) {
      this.initializePanel();
      this.initialized = true;
    }
  }

  initializePanel() {
    this.setupUI();
  }
}
