import chai from 'chai';
const expect = chai.expect;
import fs from 'fs';

import { applyChange } from '../src/fontra/client/core/changes.js';
import { VarPackedPath } from '../src/fontra/client/core/var-path.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Path Changes Tests', () => {
  const test_data_path = join(
    dirname(__dirname),
    'test-common',
    'path-change-test-data.json'
  );
  const test_data = JSON.parse(fs.readFileSync(test_data_path, 'utf8'));
  const inputPaths = test_data['inputPaths'];
  const tests = test_data['tests'];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const testName = test['testName'];
    const inputPathName = test['inputPathName'];
    const expectedPath = VarPackedPath.fromUnpackedContours(test['expectedPath']);

    const subject = VarPackedPath.fromUnpackedContours(
      copyObject(inputPaths[inputPathName])
    );
    it(`Apply Path Changes test #${i} -- ${testName}`, () => {
      applyChange(subject, test['change']);
      expect(subject).to.deep.equal(expectedPath);
    });
  }
});

function copyObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}
