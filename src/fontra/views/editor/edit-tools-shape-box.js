import { ShapeToolRect, getUnpackedContourRect } from "./edit-tools-shape.js";

export class ShapeToolBox extends ShapeToolRect {
  iconPath = "/tabler-icons/box-model-2.svg";
  identifier = "shape-tool-box";

  getUnpackedContour(x, y, width, height) {
    const margin_x = width * 0.1;
    const margin_y = height * 0.1;

    let shape_outer = getUnpackedContourRect(x, y, width, height);
    let shape_inner = getUnpackedContourRect(
      x + margin_x,
      y + margin_y,
      width - margin_x * 2,
      height - margin_y * 2
    );
    const reversed_inner = this.reversePackedContour(shape_inner[0]);

    return shape_outer.concat([reversed_inner]);
  }
}
