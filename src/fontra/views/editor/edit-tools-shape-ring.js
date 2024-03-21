import { getUnpackedContourEllipse } from "./edit-tools-shape-ellipse.js";
import { ShapeToolRect } from "./edit-tools-shape.js";

export class ShapeToolRing extends ShapeToolRect {
  iconPath = "/tabler-icons/playstation-circle.svg";
  identifier = "shape-tool-ring";

  getUnpackedContour(x, y, width, height) {
    let cx = x + width / 2;
    let cy = y + height / 2;
    let shape_outer = getUnpackedContourEllipse(cx, cy, width / 2, height / 2);
    let shape_inner = getUnpackedContourEllipse(cx, cy, width / 3, height / 3);
    const reversed_inner = this.reversePackedContour(shape_inner[0]);

    return shape_outer.concat([reversed_inner]);
  }
}
