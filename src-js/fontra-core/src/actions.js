import { translate } from "./localization.js";
import { ObservableController } from "./observable-object.js";
import {
  assert,
  capitalizeFirstLetter,
  commandKeyProperty,
  isActiveElementTypeable,
  isMac,
} from "./utils.js";

// Action Info
// const {
//   topic,
//   titleKey,
//   customShortCuts,
//   defaultShortCuts,
//   allowGlobalOverride,  // This flag allows shortcuts to work even in a focused text box
// } = action;
//
// const { baseKey, commandKey, ctrlKey, metaKey, shiftKey, altKey } = shortCut;

let actionsByBaseKey = undefined;

const actionInfoController = new ObservableController({});
const actionCallbacks = {};
actionInfoController.synchronizeWithLocalStorage("fontra-actions-", true);
actionInfoController.addListener((event) => {
  actionsByBaseKey = undefined;
});

export function registerAction(
  actionIdentifier,
  actionInfo,
  callback,
  enabled = null,
  title = null
) {
  registerActionInfo(actionIdentifier, actionInfo);
  registerActionCallbacks(actionIdentifier, callback, enabled, title);
}

const topicSortIndices = {};

export function registerActionInfo(actionIdentifier, actionInfo) {
  actionInfoController.synchronizeItemWithLocalStorage(actionIdentifier, actionInfo);
  // We only want customShortCuts to be changable, so we'll reset everything
  // except customShortCuts
  if (!topicSortIndices[actionInfo.topic]) {
    topicSortIndices[actionInfo.topic] = 0;
  }
  const sortIndex =
    actionInfo.sortIndex === undefined
      ? topicSortIndices[actionInfo.topic]
      : actionInfo.sortIndex;
  const storedActionInfo = getActionInfo(actionIdentifier);
  actionInfoController.model[actionIdentifier] = {
    ...actionInfo,
    customShortCuts: storedActionInfo.customShortCuts,
    sortIndex,
  };
  topicSortIndices[actionInfo.topic] = sortIndex + 1;
}

export function registerActionCallbacks(
  actionIdentifier,
  callback,
  enabled = null,
  title = null
) {
  actionCallbacks[actionIdentifier] = { callback, enabled, title };
}

export function setCustomShortCuts(actionIdentifier, customShortCuts) {
  const actionInfo = actionInfoController.model[actionIdentifier];
  assert(actionInfo, `unknown actionIdentifier: ${actionIdentifier}`);
  actionInfoController.model[actionIdentifier] = { ...actionInfo, customShortCuts };
}

export function getActionIdentifiers() {
  return Object.keys(actionInfoController.model);
}

export function getActionInfo(actionIdentifier) {
  return actionInfoController.model[actionIdentifier];
}

export function getActionTitle(actionIdentifier, args = "") {
  const actionInfo = getActionInfo(actionIdentifier);
  const callbacks = actionCallbacks[actionIdentifier];
  return translate(
    callbacks?.title?.() || actionInfo?.titleKey || actionIdentifier,
    args
  );
}

// reference: https://www.toptal.com/developers/keycode/table
export const shortCutKeyMap = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Tab: "⇥",
  Delete: "⌦",
  Backspace: "⌫",
  NumpadMultiply: "Numpad*",
  NumpadDivide: "Numpad/",
  NumpadAdd: "Numpad+",
  NumpadSubtract: "Numpad-",
  NumpadEnter: "Numpad↵",
  NumpadDecimal: "Numpad.",
  NumpadEqual: "Numpad=",
  Enter: "↵",
  Space: "␣",
  Escape: "Esc",
  Home: "⌂",
  End: "End",
  NumLock: "⌧",
  PageUp: "⇞",
  PageDown: "⇟",
  CapsLock: "⇪",
};

// add A-Z keys
for (const key of new Array(26).fill(1).map((_, i) => String.fromCharCode(65 + i))) {
  shortCutKeyMap[`Key${key}`] = key;
}
// add 0-9 keys
for (let i = 0; i <= 9; i++) {
  shortCutKeyMap[`Digit${i}`] = `${i}`;
}

export const shortCutModifierMap = {
  commandKey: isMac ? "⌘" : "Ctrl+", // fontra specific cross-platform key
  metaKey: isMac ? "⌘" : "Meta+",
  shiftKey: isMac ? "⇧" : "Shift+",
  ctrlKey: isMac ? "⌃" : "Ctrl+",
  altKey: isMac ? "⌥" : "Alt+",
};

export function getShortCuts(actionIdentifier) {
  const actionInfo = getActionInfo(actionIdentifier);
  return actionInfo?.customShortCuts || actionInfo?.defaultShortCuts || [];
}

export function getShortCut(actionIdentifier) {
  const shortCuts = getShortCuts(actionIdentifier);
  return shortCuts[0];
}

export function getShortCutRepresentationFromActionIdentifier(actionIdentifier) {
  if (!actionIdentifier) {
    return "";
  }
  return getShortCutRepresentation(getShortCut(actionIdentifier));
}

export function getShortCutRepresentation(shortCutDefinition) {
  if (!shortCutDefinition) {
    // Shortcut definition can be undefined,
    // if the action has no shortcut specified.
    return "";
  }
  let shortCutRepr = "";

  for (const key of Object.keys(shortCutModifierMap)) {
    if (shortCutDefinition[key]) {
      shortCutRepr += shortCutModifierMap[key];
    }
  }

  if (!shortCutDefinition.baseKey) {
    // This is possible during recoding of custom shortcuts.
    return shortCutRepr;
  }
  shortCutRepr +=
    shortCutKeyMap[shortCutDefinition.baseKey] ||
    capitalizeFirstLetter(shortCutDefinition.baseKey);

  return shortCutRepr;
}

export function canPerformAction(actionIdentifier) {
  const callbacks = actionCallbacks[actionIdentifier];
  return !!callbacks?.callback && (!callbacks.enabled || callbacks.enabled());
}

export function doPerformAction(actionIdentifier, event) {
  if (!canPerformAction(actionIdentifier)) {
    return false;
  }
  const { enabled, callback } = actionCallbacks[actionIdentifier];
  callback(event);
  return true;
}

export function getActionIdentifierFromKeyEvent(event) {
  if (event.repeat) {
    return null;
  }

  loadActionsByBaseKey();

  const actionShortCuts = actionsByBaseKey[getBaseKeyFromKeyEvent(event)];

  if (!actionShortCuts) {
    return null;
  }

  for (const { actionIdentifier, shortCut } of actionShortCuts) {
    const actionInfo = actionInfoController.model[actionIdentifier];
    assert(actionInfo, `Undefined action: ${actionIdentifier}`);

    if (
      isActiveElementTypeable() &&
      !shortCut.commandKey &&
      !shortCut.metaKey &&
      !shortCut.ctrlKey
    ) {
      // We are in an editable text area: we will not match short cuts
      // that don't use the meta key or the control key.
      continue;
    }

    if (
      !actionInfo.allowGlobalOverride &&
      (isActiveElementTypeable() || window.getSelection().toString())
    ) {
      // We are either in an editable text area, or there is non-editable text
      // selected, and the action didn't set allowGlobalOverride. Ignore this
      // context.
      continue;
    }

    if (!matchEventModifiers(shortCut, event) || !actionCallbacks[actionIdentifier]) {
      continue;
    }

    return actionIdentifier;
  }

  return null;
}

let currentKeyboardLayoutMap = null;

function fetchKeyboardLayout() {
  navigator.keyboard?.getLayoutMap().then((keyboardLayoutMap) => {
    currentKeyboardLayoutMap = keyboardLayoutMap;
  });
}

fetchKeyboardLayout();

const keyboardFallbackMapping = {
  " ": "Space",
};

export function getBaseKeyFromKeyEvent(event) {
  assert(event.type === "keydown" || event.type === "keyup");

  let baseKey;

  if (navigator.keyboard) {
    // Use Keyboard API
    // Hmm: when the keyboard layout changes, we'll always be one event behind,
    // since the Keyboard API is async
    fetchKeyboardLayout();
    baseKey = currentKeyboardLayoutMap.get(event.code);
  } else if ([...event.key].length === 1) {
    // Use deprecated .keyCode property: "best effort"
    baseKey =
      ((event.code.length == 4 && event.code.slice(0, 3) == "Key") ||
        (event.code.length == 6 && event.code.slice(0, 5) == "Digit")) &&
      event.keyCode >= 32 &&
      event.keyCode <= 126
        ? String.fromCodePoint(event.keyCode).toLowerCase()
        : event.key;

    baseKey = keyboardFallbackMapping[baseKey] || baseKey;
  }

  return baseKey || event.code;
}

function loadActionsByBaseKey() {
  if (actionsByBaseKey) {
    return;
  }
  actionsByBaseKey = {};
  for (const [actionIdentifier, action] of Object.entries(actionInfoController.model)) {
    for (const shortCut of action.customShortCuts || action.defaultShortCuts || []) {
      if (!actionsByBaseKey[shortCut.baseKey]) {
        actionsByBaseKey[shortCut.baseKey] = [];
      }
      actionsByBaseKey[shortCut.baseKey].push({ actionIdentifier, shortCut });
    }
  }
}

const modifierProperties = ["metaKey", "ctrlKey", "shiftKey", "altKey"];

function matchEventModifiers(shortCut, event) {
  const expectedModifiers = { ...shortCut };
  if (shortCut.commandKey) {
    expectedModifiers[commandKeyProperty] = true;
  }

  return modifierProperties.every(
    (modifierProp) => !!expectedModifiers[modifierProp] === !!event[modifierProp]
  );
}
