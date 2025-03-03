import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function parametrize(testName, testItems, func) {
  for (let i = 0; i < testItems.length; i++) {
    const testItem = testItems[i];
    it(`${testName} ${i}`, async () => {
      await func(testItem);
    });
  }
}

export function getTestData(fileName) {
  const path = join(dirname(__dirname), "..", "..", "test-common", fileName);
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function readRepoPathAsJSON(path) {
  path = join(dirname(__dirname), path);
  return JSON.parse(fs.readFileSync(path, "utf8"));
}
