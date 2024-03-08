import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { insertContourAndSetupAnchorPoint } from "./edit-tools-pen.js";

export class ShapeTool extends BaseTool {
  iconPath = "/tabler-icons/shape.svg";
  identifier = "shape-tool";

  handleHover(event) {}

  setCursor() {
    if (this.sceneModel.selectedGlyph?.isEditing) {
      this.canvasController.canvas.style.cursor = "crosshair";
    }
  }

  handleHover(event) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.setCursor();
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }
    console.log(initialEvent);
    const initialX = initialEvent.x;
    const initialY = initialEvent.y;
    let eventX;
    let eventY;
    let minX = initialX;
    let minY = initialY;
    let maxX = initialX;
    let maxY = initialY;

    for await (const event of eventStream) {
      eventX = event.x;
      eventY = event.y;
      if (eventX === undefined) {
        // We can receive non-pointer events like keyboard events: ignore
        continue;
      }
      // console.log(event);
      // compute selection bounding box
      minX = Math.min(minX, eventX);
      minY = Math.min(minY, eventY);
      maxX = Math.max(maxX, eventX);
      maxY = Math.max(maxY, eventY);
      console.log(minX, minY, maxX, maxY);

      if (Math.abs(maxX - minX) < 1.0 || Math.abs(maxY - minY) < 1.0) {
        // skip drawing
      }

      let path2d = new Path2D();
      path2d.rect(initialX, initialY, maxX, maxY);
      //ctx.stroke(path2d);
      //this.sceneController

      // this.canvasController.requestUpdate();
    }
  }

  deactivate() {
    this.canvasController.requestUpdate();
  }
}
