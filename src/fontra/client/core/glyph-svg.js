export class SVGPath2D {
  constructor(scaleFactor = 1, numDigits = 1, offsetX = 0, offsetY = 0) {
    const precisionFactor = 10 ** numDigits;
    this.numerator = scaleFactor * precisionFactor;
    this.denominator = precisionFactor;
    this.offsetX = offsetX * this.denominator;
    this.offsetY = offsetY * this.denominator;
    this.items = [];
  }

  getPath() {
    return this.items.join("");
  }

  _format(x, y) {
    return formatCoordinate(
      x,
      y,
      this.numerator,
      this.denominator,
      this.offsetX,
      this.offsetY
    );
  }

  moveTo(x, y) {
    this.items.push("M" + this._format(x, y));
  }

  lineTo(x, y) {
    this.items.push("L" + this._format(x, y));
  }

  bezierCurveTo(x1, y1, x2, y2, x3, y3) {
    this.items.push(
      `C${this._format(x1, y1)} ${this._format(x2, y2)} ${this._format(x3, y3)}`
    );
  }

  quadraticCurveTo(x1, y1, x2, y2) {
    this.items.push(`Q${this._format(x1, y1)} ${this._format(x2, y2)}`);
  }

  closePath() {
    this.items.push("Z");
  }
}

function formatCoordinate(x, y, numerator, denominator, dx, dy) {
  x = Math.round(x * numerator + dx) / denominator;
  y = Math.round(y * numerator + dy) / denominator;
  return `${x},${y}`;
}

export function pathToSVG(instance, bounds) {
  const path = new SVGPath2D();
  instance.path.drawToPath2d(path);
  const pathString = path.getPath();

  const width = bounds["xMax"] - bounds["xMin"];
  const height = bounds["yMax"] - bounds["yMin"];

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
  viewBox="${Math.floor(bounds["xMin"])} ${Math.floor(bounds["yMin"])} ${Math.ceil(
    bounds["xMax"]
  )} ${Math.ceil(bounds["yMax"])}">
  <path transform="matrix(1 0 0 -1 0 ${height})" d="${pathString}"/>
  </svg>`;
  return svgString;
}
