import { ObservableController } from "./observable-object.js";

// Don't edit this block, see scripts/rebuild_languages.py
export const languages = [
  { code: "en", langEn: "English", langLang: "English", status: "done" },
  { code: "zh-CN", langEn: "Simplified Chinese", langLang: "简体中文", status: "beta" },
  { code: "ja", langEn: "Japanese", langLang: "日本語", status: "beta" },
  { code: "fr", langEn: "French", langLang: "Français", status: "beta" },
  { code: "de", langEn: "German", langLang: "Deutsch", status: "wip" },
  { code: "nl", langEn: "Dutch", langLang: "Nederlands", status: "wip" },
];

const debugTranslation = false;
let localizationData = {};

export const languageController = new ObservableController({ language: "en" });
languageController.synchronizeWithLocalStorage("fontra-language-");

let resolveLanguageHasLoaded;

/**
 * `ensureLanguageHasLoaded` is a promise that will be resolved once
 * the language file has been loaded.
 */
export const ensureLanguageHasLoaded = new Promise((resolve) => {
  resolveLanguageHasLoaded = resolve;
});

function languageChanged(locale) {
  // Do explicit .replace() because our cache busting mechanism is simplistic,
  // and backtick strings don't work.
  const translationsPath = "/lang/locale.js".replace("locale", locale);

  import(/*webpackIgnore: true*/ translationsPath)
    .then((mod) => {
      localizationData = mod.strings;
      resolveLanguageHasLoaded();
    })
    .catch((e) => {
      if (locale !== "en") {
        console.log(`ERROR: could not load language strings for locale "${locale}"`);
        // Fall back to english
        languageChanged("en");
      } else {
        // Couldn't load English locale strings, fall back to keys
        resolveLanguageHasLoaded();
      }
    });
}

languageController.addKeyListener("language", (event) => {
  languageChanged(languageController.model.language);
  // TODO: Implement a better way to localize the page
  // This method does not work perfectly on Chrome (and Edge maybe)
  window.location.reload(true);
});

languageChanged(languageController.model.language || "en");

function formatString(template, ...args) {
  return template.replace(/%\d+/g, (match) => {
    const index = parseInt(match.substring(1), 10);

    // Validation: Check that the index is a non-negative integer, and within bounds
    return Number.isInteger(index) && index >= 0 && index < args.length
      ? String(args[index])
      : match;
  });
}

/**
 * Translate the key to the corresponding value in the localizationData
 * @param {string} key - The key to translate
 * @param {...string} [args] - The arguments to replace in the translated value
 * @returns {string} The translated value
 */
export function translate(key, ...args) {
  const translation = localizationData[key];

  if (typeof key !== "string" || translation === undefined || debugTranslation) {
    return key;
  }

  return args.length > 0 ? formatString(translation, ...args) : translation;
}

/**
 * Translate the key to the corresponding value in the localizationData, with pluralization
 * @param {string} key - The key to translate
 * @param {number} quantity - The argument to replace in the translated value
 * @returns {string} The translated value
 */
export function translatePlural(key, quantity = 0) {
  const translation = localizationData[key];

  if (typeof key !== "string" || translation === undefined || debugTranslation) {
    return key;
  }

  const translationPlural = localizationData[key + ".plural"];

  if (translationPlural === undefined) {
    return formatString(translation, quantity);
  } else {
    return Math.abs(quantity) == 1
      ? formatString(translation, quantity)
      : formatString(translationPlural, quantity);
  }
}
