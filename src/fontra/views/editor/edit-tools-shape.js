import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";

export class ShapeTool extends BaseTool {
  iconPath = "/tabler-icons/shape.svg";
  identifier = "shape-tool";

  handleHover(event) {
    // console.log("handleHover");
    // if (!this.sceneModel.selectedGlyph?.isEditing) {
    //   this.editor.tools["shape-tool"].handleHover(event);
    //   return;
    // }
    // this.setCursor();
    // const { insertHandles, targetPoint } = this._getPathConnectTargetPoint(event);
    // const prevInsertHandles = this.sceneModel.pathInsertHandles;
    // const prevTargetPoint = this.sceneModel.pathConnectTargetPoint;
    // if (
    //   !handlesEqual(insertHandles, prevInsertHandles) ||
    //   !pointsEqual(targetPoint, prevTargetPoint)
    // ) {
    //   this.sceneModel.pathInsertHandles = insertHandles;
    //   this.sceneModel.pathConnectTargetPoint = targetPoint;
    //   this.canvasController.requestUpdate();
    // }
  }

  deactivate() {
    // delete this.sceneModel.pathInsertHandles;
    // delete this.sceneModel.pathConnectTargetPoint;
    this.canvasController.requestUpdate();
  }

  setCursor() {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["shape-tool"].setCursor();
    }
    // else {
    //   // this.canvasController.canvas.style.cursor = "crosshair";
    // }
  }
}
