import { enumerate } from "./utils.js";

export function dialog(headline, message, buttonDefs, autoDismissTimeout) {
  /* return a Promise with the result of the user action, or null for cancel */

  let dismissTimeoutID;
  const dialogDone = (result) => {
    if (dismissTimeoutID) {
      clearTimeout(dismissTimeoutID);
      dismissTimeoutID = undefined;
    }
    container.innerHTML = "";
    container.classList.remove("visible");
    currentActiveElement.focus();
    resolveDialogResult(result);
  };

  let resolveDialogResult;
  const resultPromise = new Promise((resolve) => {
    resolveDialogResult = resolve;
  });

  const currentActiveElement = document.activeElement;

  const container = document.querySelector("#ui-dialog-container");
  const content = document.createElement("div");
  content.className = "ui-dialog-content";
  content.tabIndex = 1; /* so we can receive key events */
  container.appendChild(content);

  const headlineElement = document.createElement("div");
  headlineElement.classList.add("ui-dialog-headline");
  headlineElement.innerText = headline;
  const messageElement = document.createElement("div");
  messageElement.classList.add("ui-dialog-message");
  messageElement.innerText = message;

  content.appendChild(headlineElement);
  content.appendChild(messageElement);

  let defaultButtonElement, cancelButtonElement;
  buttonDefs = buttonDefs.map((bd) => {
    return { ...bd };
  });
  if (buttonDefs.length === 1) {
    buttonDefs[0].isDefaultButton = true;
  }
  for (const [buttonIndex, buttonDef] of enumerate(buttonDefs, 4 - buttonDefs.length)) {
    const buttonElement = document.createElement("input");
    buttonElement.type = "button";
    buttonElement.className = `ui-dialog-button button-${buttonIndex}`;
    if (buttonDef.isDefaultButton) {
      buttonElement.classList.add("default");
      defaultButtonElement = buttonElement;
    } else if (buttonDef.isCancelButton) {
      cancelButtonElement = buttonElement;
    }
    buttonElement.value = buttonDef.title;
    buttonElement.onclick = (event) => {
      dialogDone(buttonDef.resultValue || buttonDef.title);
    };
    content.appendChild(buttonElement);
  }

  content.onkeydown = (event) => {
    if (event.key == "Enter") {
      defaultButtonElement?.click();
    } else if (event.key == "Escape") {
      cancelButtonElement?.click();
      if (!cancelButtonElement) {
        dialogDone(null);
      }
    }
    event.stopImmediatePropagation();
  };

  /* prevent clicks on the dialog itself to propagate to the container */
  content.onclick = (event) => event.stopImmediatePropagation();
  if (autoDismissTimeout) {
    dismissTimeoutID = setTimeout(() => dialogDone(null), autoDismissTimeout);
  }

  container.classList.add("visible");
  content.focus();
  container.onclick = (event) => {
    dialogDone(null);
  };

  return resultPromise;
}
