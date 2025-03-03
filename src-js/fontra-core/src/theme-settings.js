import { ObservableController } from "./observable-object.js";

function setupThemeOverride(value) {
  const rootElement = document.querySelector("html");
  rootElement.classList.remove("light-theme");
  rootElement.classList.remove("dark-theme");
  if (value !== "automatic") {
    rootElement.classList.add(value + "-theme");
  }
}

export const themeController = new ObservableController({ theme: "automatic" });

themeController.synchronizeWithLocalStorage("fontra-");

themeController.addKeyListener("theme", (event) => {
  setupThemeOverride(themeController.model.theme);
});

setupThemeOverride(themeController.model.theme);
