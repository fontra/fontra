export class BaseTool {
  constructor(editor) {
    this.editor = editor;
    this.canvasController = editor.canvasController;
    this.sceneController = editor.sceneController;
    this.sceneModel = this.sceneController.sceneModel;
    this.sceneSettingsController = editor.sceneSettingsController;
    this.sceneSettings = editor.sceneSettings;
    this.isActive = false;
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = "default";
  }

  activate() {
    this.isActive = true;
    this.setCursor();
  }

  deactivate() {
    this.isActive = false;
  }

  handleKeyDown(event) {
    //
  }
}

const MINIMUM_DRAG_DISTANCE = 2;

export async function shouldInitiateDrag(eventStream, initialEvent) {
  // drop events until the pointer moved a minimal distance
  const initialX = initialEvent.pageX;
  const initialY = initialEvent.pageY;

  for await (const event of eventStream) {
    const x = event.pageX;
    const y = event.pageY;
    if (
      Math.abs(initialX - x) > MINIMUM_DRAG_DISTANCE ||
      Math.abs(initialY - y) > MINIMUM_DRAG_DISTANCE
    ) {
      return true;
    }
  }
  return false;
}
