import "@fontra/core/theme-settings.js";

import { EditorController } from "@fontra/views-editor/editor.js";

async function startApp() {
  window.editorController = await EditorController.fromBackend();
}

startApp();
