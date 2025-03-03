import { globSync, readFileSync, writeFileSync } from "fs";
import * as prettier from "prettier";
import * as recast from "recast";
import * as babel from "recast/parsers/babel.js";

const options = await prettier.resolveConfig(".prettierrc");

const n = recast.types.namedTypes;

for (let file of globSync("src-js/*/src/*.js").concat(globSync("test-js/*.js"))) {
  let contents = readFileSync(file, "utf-8");
  const ast = recast.parse(contents, {
    parser: babel,
  });

  for (var node of ast.program.body) {
    if (n.ImportDeclaration.check(node)) {
      let origValue = node.source.value;
      node.source.value = node.source.value
        .replace("../src/fontra/client/core/", "@fontra/core/")
        .replace(/^\.\.\/web-components\//, "@fontra/web-components/")
        .replace(/^\/web-components\//, "@fontra/web-components/")
        .replace(/^(\.\.\/)+core\//, "@fontra/core/")
        .replace(/^\/core\//, "@fontra/core/")
        .replace(/^\/applicationsettings\//, "@fontra/views-applicationsettings/")
        .replace(/^\/editor\//, "@fontra/views-editor/")
        .replace(/^\/fontinfo\//, "@fontra/views-fontinfo/")
        .replace(/^\/fontoverview\//, "@fontra/views-fontoverview/")
        .replace(/^(\.\.)?\/third-party\/(.*).js/, "$2")
        .replace("unbrotli", "lib/unbrotli.js");
      if (!node.source.value) {
        throw new Error(`Empty import path after transformation: ${origValue}`);
      }
    }
  }

  const output = await prettier.format(recast.print(ast).code, {
    ...options,
    filepath: file,
  });
  writeFileSync(file, output);
}
