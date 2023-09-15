import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
const dependencies = require("./package.json").dependencies;

export default Object.keys(dependencies)
  .map((depName) => {
    return {
      input: `node_modules/${depName}`,
      output: {
        file: `src/fontra/client/third-party/${depName}.js`,
        inlineDynamicImports: true,
      },
      plugins: [
        commonjs(), // <-- this handles some parsing of js syntax or something (necessary for `export { init } from "mathjax";`)
        nodeResolve({ browser: true }), // <-- this allows npm modules to be added to bundle
      ],
    };
  })
  .concat({
    input: [
      "node_modules/lib-font/lib/inflate.js",
      "node_modules/lib-font/lib/unbrotli.js",
    ],
    output: {
      dir: "src/fontra/client/third-party/lib-font/",
    },
  });
