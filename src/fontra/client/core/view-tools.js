export function makeDisplayPath(pathItems) {
  const displayPathItems = !pathItems[0].includes(":")
    ? ["", ...pathItems]
    : [...pathItems];
  let displayPath = displayPathItems.join("/");
  while (displayPathItems.length > 2 && displayPath.length > 60) {
    displayPathItems.splice(1, 1);
    displayPath = [displayPathItems[0], "...", ...displayPathItems.slice(1)].join("/");
  }
  return displayPath;
}
