// Some deep CSS trickery going on here, as learned from:
//    https://css-tricks.com/the-css-custom-property-toggle-trick/

export function themeColorCSS(colors, element = ":host") {
  const definitions = [];
  const lightMode = [];
  const darkMode = [];
  for (const [colorName, [lightColor, darkColor]] of Object.entries(colors)) {
    definitions.push(`--${colorName}-light: var(--fontra-theme-marker) ${lightColor};`);
    definitions.push(`--${colorName}-dark: ${darkColor};`);
    definitions.push(
      `--${colorName}: var(--${colorName}-light, var(--${colorName}-dark));`
    );
  }
  return `
${element} {
${indentLines(definitions, 2)}
}
`;
}

function indentLines(lines, numSpaces) {
  lines = lines.map((line) => " ".repeat(numSpaces) + line);
  return lines.join("\n");
}
