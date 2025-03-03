const HtmlBundlerPlugin = require("html-bundler-webpack-plugin");
const path = require("path");

module.exports = (_env, argv) => {
  return import("@fontra/core/webpack-base.js").then(({ makeConfig }) => {
    return makeConfig({
      home: __dirname,
      destination: path.resolve(__dirname, "src", "fontra", "client"),
      views: [
        // Unfortunately we run into version compatibility problems if we get
        // webpack-base.js to provide its own HtmlBundlerPlugin, so we have
        // to provide our own.
        new HtmlBundlerPlugin({
          entry: {
            landing: require.resolve("@fontra/projectmanager-filesystem/landing.html"),
            applicationsettings: require.resolve(
              "@fontra/views-applicationsettings/applicationsettings.html"
            ),
            editor: require.resolve("@fontra/views-editor/editor.html"),
            fontinfo: require.resolve("@fontra/views-fontinfo/fontinfo.html"),
            fontoverview: require.resolve(
              "@fontra/views-fontoverview/fontoverview.html"
            ),
          },
        }),
      ],
      production: argv.mode === "production",
      custom: {
        extends: require.resolve("@fontra/core/webpack.config.cjs"), // This does the copy of core assets
        optimization: {
          splitChunks: {
            cacheGroups: {
              vendor: {
                test: /\.(js|ts)$/, // <= IMPORTANT: split only script files
                chunks: "all", // <= DEFINE it here only
                name({ context }, chunks, groupName) {
                  // save split chunks of the node module under package name
                  if (/[\\/]node_modules[\\/]/.test(context)) {
                    const moduleName = context
                      .match(/[\\/]node_modules[\\/](.*?)(?:[\\/]|$)/)[1]
                      .replace("@", "");
                    return `npm.${moduleName}`;
                  } else if (/[\\/]src-js[\\/]/.test(context)) {
                    return context
                      .match(/[\\/]src-js[\\/](.*?)(?:[\\/]|$)/)[1]
                      .replace("@", "");
                    // return "fontra";
                  }
                  // save split chunks of the application
                  return groupName;
                },
              },
            },
          },
        },
      },
    });
  });
};
