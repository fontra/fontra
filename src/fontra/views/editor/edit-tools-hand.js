import { BaseTool } from './edit-tools-base.js';

export class HandTool extends BaseTool {
  handleHover(event) {
    this.canvasController.canvas.style.cursor = 'grab';
  }

  async handleDrag(eventStream, initialEvent) {
    const initialX = initialEvent.x;
    const initialY = initialEvent.y;
    const originalOriginX = this.canvasController.origin.x;
    const originalOriginY = this.canvasController.origin.y;
    this.canvasController.canvas.style.cursor = 'grabbing';
    for await (const event of eventStream) {
      this.canvasController.origin.x = originalOriginX + event.x - initialX;
      this.canvasController.origin.y = originalOriginY + event.y - initialY;
      this.canvasController.setNeedsUpdate();
    }
    this.canvasController.canvas.style.cursor = 'grab';
  }
}
