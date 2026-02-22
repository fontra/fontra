let CopyPlugin = require("copy-webpack-plugin");
let path = require("path");

class WatchRunPlugin {
  apply(compiler) {
    compiler.hooks.watchRun.tap("WatchRun", (comp) => {
      if (comp.modifiedFiles) {
        const changedFiles = Array.from(
          comp.modifiedFiles,
          (file) => `\n  ${file}`
        ).join("");
        console.log("===============================");
        console.log("FILES CHANGED:", changedFiles);
        console.log("===============================");
      }
    });
  }
}

module.exports = {
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          context: path.resolve(__dirname, "assets"),
          from: "**/*",
        },
        {
          from: "node_modules/harfbuzzjs/hb.wasm",
        },
      ],
    }),
    new WatchRunPlugin(),
  ],
};
