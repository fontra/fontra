import { Transform } from "./transform.js";

export function createElement(tagName, attributes, children) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  for (const [key, value] of Object.entries(attributes || {})) {
    if (key.slice(0, 2) === "on") {
      element[key] = value;
    } else {
      element.setAttribute(key, value);
    }
  }
  element.append(...(children || []));
  return element;
}

function transformableElement(tagName, attributes, children) {
  if (attributes && "transform" in attributes) {
    attributes = { ...attributes, transform: unpackTransform(attributes.transform) };
  }
  return createElement(tagName, attributes, children);
}

function unpackTransform(transformObject) {
  if (typeof transformObject === "string") {
    return transformObject;
  }
  const t = transformObject;
  return `matrix(${t.xx} ${t.xy} ${t.yx} ${t.yy} ${t.dx} ${t.dy})`;
}

export const svg = transformableElement.bind(null, "svg");
export const style = transformableElement.bind(null, "style");

export const a = transformableElement.bind(null, "a");
export const circle = transformableElement.bind(null, "circle");
export const clipPath = transformableElement.bind(null, "clipPath");
export const defs = transformableElement.bind(null, "defs");
export const ellipse = transformableElement.bind(null, "ellipse");
export const foreignObject = transformableElement.bind(null, "foreignObject");
export const g = transformableElement.bind(null, "g");
export const image = transformableElement.bind(null, "image");
export const line = transformableElement.bind(null, "line");
export const path = transformableElement.bind(null, "path");
export const polygon = transformableElement.bind(null, "polygon");
export const polyline = transformableElement.bind(null, "polyline");
export const rect = transformableElement.bind(null, "rect");
// export const switch = transformableElement.bind(null, "switch")  // "switch" is a reserved word
export const text = transformableElement.bind(null, "text");
export const use = transformableElement.bind(null, "use");

class TransformDegrees extends Transform {
  rotate(angle) {
    return super.rotate((angle * Math.PI) / 180);
  }
}
export function translate(x, y) {
  return new TransformDegrees().translate(x, y);
}

export function scale(x, y) {
  return new TransformDegrees().scale(x, y);
}

export function rotate(angle) {
  return new TransformDegrees().rotate(angle);
}

export function viewBox(x, y, w, h) {
  return `${x} ${y} ${w} ${h}`;
}

export function points(pointsArray) {
  return pointsArray
    .map((point) => [point.x, point.y])
    .flat()
    .join(" ");
}
