import {
  applicationSettings,
  applicationSettingsController,
} from "./application-settings.js";
import { fetchJSON } from "./utils.ts";

function upconvertLegacyPlugins() {
  if (!applicationSettings.plugins?.length) {
    const legacyPlugins = localStorage.getItem("fontra.pluginsplugins");

    if (legacyPlugins) {
      applicationSettings.plugins = JSON.parse(legacyPlugins);
      localStorage.removeItem("fontra.pluginsplugins");
    }
  }

  applicationSettings.plugins = applicationSettings.plugins.map((plugin) => {
    if (!plugin.entryPoints && plugin.address) {
      plugin = { ...plugin };
      plugin.types = ["editor"];
    }
    return plugin;
  });
}

upconvertLegacyPlugins();

const importTimeStamp = Date.now(); /* for cache busting */

async function fetchPluginInfo(pluginPath) {
  const url = `${pluginPath}/plugin.json?t=${importTimeStamp}`;

  let response;

  try {
    response = await fetch(url);
  } catch (e) {
    return { error: "plugin-manager.warning.fetching-error" };
  }

  if (response.status === 404) {
    return { error: "plugin-manager.warning.not-found" };
  }

  const pluginInfo = await response.json();

  // Upconvert plugin meta data
  if (!pluginInfo["entry-points"]) {
    pluginInfo["entry-points"] = [
      {
        type: "editor",
        script: pluginInfo.init,
        function: pluginInfo.function,
      },
    ];

    delete pluginInfo.init;
    delete pluginInfo.function;
  }

  return { pluginInfo };
}

export async function loadPlugins(pluginType, pluginOwner) {
  for (const { address, types } of applicationSettings.plugins) {
    if (!types.includes(pluginType)) {
      continue;
    }

    const pluginPath = parsePluginBasePath(address);

    const { pluginInfo, error } = await fetchPluginInfo(pluginPath);
    if (error) {
      console.log(`Skipping plugin "${address}": ${error}`);
      continue;
    }

    const entryPoint = pluginInfo["entry-points"].find(
      ({ type }) => type === pluginType
    );
    if (!entryPoint) {
      console.log(
        `Skipping plugin "${address}": no entry point found for ${pluginType}`
      );
      continue;
    }
    const initScript = entryPoint.script;
    const functionName = entryPoint.function;
    let module;

    try {
      // webpackIgnore: keep this a real dynamic import at runtime; the plug-in
      // lives outside the bundle (a URL or a server path), webpack must not
      // try to resolve it at build time.
      module = await import(
        /* webpackIgnore: true */ `${pluginPath}/${initScript}?t=${importTimeStamp}`
      );
    } catch (e) {
      console.error("Module didn't load");
      console.log(e);
      continue;
    }

    try {
      module[functionName](pluginOwner, pluginPath);
    } catch (e) {
      console.error(
        `Error occured when running (${pluginInfo.name || address}) plugin.`
      );
      console.log(e);
      continue;
    }
  }
}

export async function validatePlugin(pluginPath) {
  if (
    applicationSettings.plugins.some(
      ({ address }) => parsePluginBasePath(address) === pluginPath
    )
  ) {
    return { error: "plugin-manager.warning.plugin-exists" };
  }

  return await fetchPluginInfo(pluginPath);
}

export function parsePluginBasePath(address, version = "latest") {
  let baseURL;

  if (address.split("/").length === 2) {
    baseURL = `https://cdn.jsdelivr.net/gh/${address}@${version}`;
  } else {
    baseURL = address.endsWith("/") ? address.slice(0, -1) : address;
  }

  return baseURL;
}
