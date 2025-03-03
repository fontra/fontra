import { BaseTool } from "./edit-tools-base.js";

export class HandTool extends BaseTool {
  iconPath = "/images/hand.svg";
  identifier = "hand-tool";

  handleHover(event) {
    this.setCursor();
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = "grab";
  }

  async handleDrag(eventStream, initialEvent) {
    const initialX = initialEvent.x;
    const initialY = initialEvent.y;
    const originalOriginX = this.canvasController.origin.x;
    const originalOriginY = this.canvasController.origin.y;
    this.canvasController.canvas.style.cursor = "grabbing";
    for await (const event of eventStream) {
      if (event.x === undefined) {
        // We can receive non-pointer events like keyboard events: ignore
        continue;
      }
      this.canvasController.origin.x = originalOriginX + event.x - initialX;
      this.canvasController.origin.y = originalOriginY + event.y - initialY;
      this.canvasController.requestUpdate();
    }
    this.canvasController.canvas.style.cursor = "grab";
  }
}
