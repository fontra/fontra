import * as html from "/core/unlit.js";
import { css } from "../third-party/lit.js";
import Panel from "./panel.js";

import { ObservableController } from "/core/observable-object.js";
import { div, input, label, select, option } from "/core/unlit.js";
import { fileNameExtension, withTimeout, fetchJSON } from "/core/utils.js";
import { UIList } from "/web-components/ui-list.js";
import { dialog } from "/web-components/modal-dialog.js";

import { Font } from "/third-party/lib-font.js";

import { registerVisualizationLayerDefinition } from "./visualization-layer-definitions.js";

let referenceFontModel;

const fontFileExtensions = new Set(["ttf", "otf", "woff", "woff2"]);

registerVisualizationLayerDefinition({
  identifier: "fontra.reference.font",
  name: "Reference font",
  selectionMode: "editing",
  userSwitchable: true,
  defaultOn: true,
  zIndex: 100,
  screenParameters: { strokeWidth: 1 },
  colors: { fillColor: "#AAA6" },
  // colorsDarkMode: { strokeColor: "red" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!referenceFontModel?.referenceFontName) {
      return;
    }
    let text = referenceFontModel?.charOverride || positionedGlyph.character;
    if (!text && positionedGlyph.glyphName.includes(".")) {
      const baseGlyphName = positionedGlyph.glyphName.split(".")[0];
      const codePoint = (editorController.fontController.glyphMap[baseGlyphName] ||
        [])[0];
      if (codePoint) {
        text = String.fromCodePoint(codePoint);
      }
    }
    if (!text) {
      return;
    }
    context.lineWidth = parameters.strokeWidth;
    context.font = `${model.fontController.unitsPerEm}px ${referenceFontModel.referenceFontName}, AdobeBlank`;
    context.scale(1, -1);
    if (parameters.fillColor) {
      context.fillStyle = parameters.fillColor;
      context.fillText(text, 0, 0);
    }
    if (parameters.strokeColor) {
      context.strokeStyle = parameters.strokeColor;
      context.strokeText(text, 0, 0);
    }
  },
});

function cleanFontItems(fontItems) {
  return fontItems.map((fontItem) => {
    return {
      uplodadedFileName: fontItem.uplodadedFileName,
      fontIdentifier: fontItem.fontIdentifier,
      supportedLanguages: fontItem.supportedLanguages,
    };
  });
}

async function garbageCollectUnusedFiles(fontItems) {
  const usedFontIdentifiers = new Set(
    fontItems.map((fontItem) => fontItem.fontIdentifier)
  );
  const fileNames = await listFontFileNamesInOPFS();
  for (const fileName of fileNames) {
    if (!usedFontIdentifiers.has(fileName)) {
      // Unused font file
      deleteFontFileFromOPFS(fileName);
    }
  }
}

function garbageCollectFontItem(fontItem) {
  if (fontItem.fontFace) {
    document.fonts.delete(fontItem.fontFace);
  }
  if (fontItem.objectURL) {
    URL.revokeObjectURL(fontItem.objectURL);
  }
}

async function getOPFSFontsDir() {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle("reference-fonts", { create: true });
}

async function listFontFileNamesInOPFS() {
  const fontsDir = await getOPFSFontsDir();
  const fileNames = [];
  for await (const [name, handle] of fontsDir.entries()) {
    fileNames.push(name);
  }
  return fileNames;
}

async function readFontFileFromOPFS(fileName) {
  const fontsDir = await getOPFSFontsDir();
  const fileHandle = await fontsDir.getFileHandle(fileName);
  return await fileHandle.getFile();
}

async function deleteFontFileFromOPFS(fileName) {
  const fontsDir = await getOPFSFontsDir();
  await fontsDir.removeEntry(fileName);
}

let opfsSupportsCreateWritable;

async function writeFontFileToOPFS(fileName, file) {
  if (opfsSupportsCreateWritable == undefined || opfsSupportsCreateWritable === true) {
    const error = await writeFontFileToOPFSAsync(fileName, file);
    if (opfsSupportsCreateWritable == undefined) {
      opfsSupportsCreateWritable = !error;
    }
  }
  if (opfsSupportsCreateWritable === false) {
    await writeFontFileToOPFSInWorker(fileName, file);
  }
}

async function writeFontFileToOPFSAsync(fileName, file) {
  const fontsDir = await getOPFSFontsDir();
  const fileHandle = await fontsDir.getFileHandle(fileName, { create: true });
  if (!fileHandle.createWritable) {
    // This is the case in Safari (as of august 2023)
    return "OPFS does not support fileHandle.createWritable()";
  }
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

let worker;

function getWriteWorker() {
  if (!worker) {
    const path = "/core/opfs-write-worker.js"; // + `?${Math.random()}`;
    worker = new Worker(path);
  }
  return worker;
}

async function writeFontFileToOPFSInWorker(fileName, file) {
  return await withTimeout(
    new Promise((resolve, reject) => {
      const worker = getWriteWorker();
      worker.onmessage = (event) => {
        if (event.data.error) {
          reject(event.data.error);
        } else {
          resolve(event.data.returnValue);
        }
      };
      worker.postMessage({ path: ["reference-fonts", fileName], file });
    }),
    5000
  );
}

async function readSupportedLanguages(fontItem, file, languageMapping) {
  return new Promise((resolve, reject) => {
    const font = new Font(fontItem.fontIdentifier);
    font.onerror = (event) => {
      console.error(event);
      resolve([]);
    };
    font.onload = (event) => {
      const font = event.detail.font;
      const getLangs = (table) => {
        if (table) {
          return table
            .getSupportedScripts()
            .reduce((acc, script) => {
              const scriptTable = table.getScriptTable(script);
              return acc.concat(table.getSupportedLangSys(scriptTable));
            }, [])
            .map((lang) => lang.trim());
        } else {
          return [];
        }
      };
      const gsubLangs = getLangs(font.opentype.tables.GSUB);
      const gposLangs = getLangs(font.opentype.tables.GPOS);
      const allLangs = new Set([...gsubLangs, ...gposLangs]);
      resolve(
        [...allLangs]
          .filter((lang) => languageMapping[lang])
          .map((lang) => languageMapping[lang])
      );
    };
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      font.fromDataBuffer(reader.result);
    });
    reader.readAsArrayBuffer(file);
  });
}

export default class ReferenceFontPanel extends Panel {
  identifier = "reference-font";
  iconPath = "/images/reference.svg";

  static styles = css`
    .sidebar-reference-font {
      width: 100%;
      height: 100%;
      display: flex;
    }

    #reference-font {
      width: 100%;
      display: grid;
      padding: 1em;
      gap: 1em;
      height: 100%;
      box-sizing: border-box;
      white-space: normal;
      align-content: start;
    }

    .title {
      font-weight: bold;
    }

    input[type="text"] {
      border-radius: 5px;
      min-width: 4em;
      outline: none;
      border: none;
      background-color: var(--text-input-background-color);
      color: var(--text-input-foreground-color);
      padding: 0.4em;
      font-family: fontra-ui-regular;
      font-feature-settings: "tnum" 1;
    }
  `;

  _fontListChangedHandler(event) {
    if (event.senderInfo?.senderID === this) {
      return;
    }
    this.model.selectedFontIndex = -1;

    const itemsByFontID = Object.fromEntries(
      this.filesUIList.items.map((item) => [item.fontIdentifier, item])
    );

    const newItems = event.newValue.map((item) => {
      const existingItem = itemsByFontID[item.fontIdentifier];
      if (existingItem) {
        item = existingItem;
        delete itemsByFontID[item.fontIdentifier];
      }
      return item;
    });

    for (const leftoverItem of Object.values(itemsByFontID)) {
      garbageCollectFontItem(leftoverItem);
    }

    this.filesUIList.setItems(newItems, true);
    if (this.filesUIList.getSelectedItemIndex() === undefined) {
      this.model.referenceFontName = "";
    }
  }

  get model() {
    return this.controller.model;
  }

  async _filesDropHandler(files) {
    const fontItemsInvalid = [];
    const fontItems = [...files]
      .filter((file) => {
        const fileExtension = fileNameExtension(file.name).toLowerCase();
        const fileTypeSupported = fontFileExtensions.has(fileExtension);
        if (!fileTypeSupported) {
          fontItemsInvalid.push(file);
        }
        return fileTypeSupported;
      })
      .map((file) => {
        return {
          uplodadedFileName: file.name,
          droppedFile: file,
          objectURL: URL.createObjectURL(file),
          fontIdentifier: `ReferenceFont-${crypto.randomUUID()}`,
        };
      });

    if (fontItemsInvalid.length) {
      const dialogTitle = `The following item${
        fontItemsInvalid.length > 1 ? "s" : ""
      } can't be used as a reference font:`;
      const dialogMessage = fontItemsInvalid
        .map((file) => {
          return `- ${file.name}`;
        })
        .join("\n");
      dialog(dialogTitle, dialogMessage, [{ title: "Okay" }], 5000);
    }

    const newSelectedItemIndex = this.filesUIList.items.length;
    const newItems = [...this.filesUIList.items, ...fontItems];
    this.filesUIList.setItems(newItems);
    this.filesUIList.setSelectedItemIndex(newSelectedItemIndex, true);

    const writtenFontItems = [...this.model.fontList];
    try {
      for (const fontItem of fontItems) {
        await writeFontFileToOPFS(fontItem.fontIdentifier, fontItem.droppedFile);
        delete fontItem.droppedFile;
        writtenFontItems.push(fontItem);
      }
    } catch (error) {
      dialog("Could not store some reference fonts", error.toString(), [
        { title: "Okay" },
      ]);
    }

    // Only notify the list controller *after* the files have been written,
    // or else other tabs will try to read the font data too soon and will
    // fail
    this.controller.setItem("fontList", cleanFontItems(writtenFontItems), {
      senderID: this,
    });
  }

  async _listSelectionChangedHandler() {
    const fontItem = this.filesUIList.getSelectedItem();
    if (!fontItem) {
      this.model.referenceFontName = "";
      this.model.selectedFontIndex = -1;
      this.model.selectedLanguages = [];
      return;
    }
    const selectedFontIndex = this.filesUIList.getSelectedItemIndex();
    this.model.selectedFontIndex =
      selectedFontIndex !== undefined ? selectedFontIndex : -1;

    if (!fontItem.fontFace) {
      if (!fontItem.objectURL) {
        const file = await readFontFileFromOPFS(fontItem.fontIdentifier);
        fontItem.objectURL = URL.createObjectURL(file);
      }
      fontItem.fontFace = new FontFace(
        fontItem.fontIdentifier,
        `url(${fontItem.objectURL})`,
        {}
      );
      document.fonts.add(fontItem.fontFace);
      await fontItem.fontFace.load();
    }
    if (!fontItem.supportedLanguages) {
      const file = await fetch(fontItem.objectURL).then((b) => b.blob());
      fontItem.supportedLanguages = await readSupportedLanguages(
        fontItem,
        file,
        this.languageMapping
      );
    }
    this.model.referenceFontName = fontItem.fontIdentifier;
    this.model.supportedLanguages = fontItem.supportedLanguages;
  }

  async _deleteSelectedItemHandler() {
    await this._deleteItemOrAll(this.filesUIList.getSelectedItemIndex());
  }

  async _deleteAllHandler() {
    await this._deleteItemOrAll(undefined);
  }

  async _deleteItemOrAll(index) {
    const fontItems = [...this.filesUIList.items];

    let itemsToDelete, newItems;
    if (index !== undefined) {
      itemsToDelete = [fontItems[index]];
      fontItems.splice(index, 1);
      newItems = fontItems;
    } else {
      itemsToDelete = fontItems;
      newItems = [];
    }

    this.model.selectedFontIndex = -1;
    this.model.referenceFontName = "";

    this.filesUIList.setItems(newItems);

    // Only share those fonts that we successfully stored before
    const storedFontIDs = new Set(
      this.model.fontList.map((item) => item.fontIdentifier)
    );
    this.controller.setItem(
      "fontList",
      cleanFontItems(newItems.filter((item) => storedFontIDs.has(item.fontIdentifier))),
      {
        senderID: this,
      }
    );

    for (const fontItem of itemsToDelete) {
      garbageCollectFontItem(fontItem);
      await deleteFontFileFromOPFS(fontItem.fontIdentifier);
    }
  }

  getContentElement() {
    this.languageMapping = {};
    this.controller = new ObservableController({
      languageCode: "",
      supportedLanguages: [],
      selectedFontIndex: -1,
      fontList: [],
      charOverride: "",
      referenceFontName: "",
    });
    this.controller.synchronizeWithLocalStorage("fontra.reference-font.");
    this.controller.addKeyListener("fontList", (event) =>
      this._fontListChangedHandler(event)
    );
    this.controller.addKeyListener("supportedLanguages", () => {
      this.languageCodeInput.innerHTML = "";
      const supportedLanguages = this.model.supportedLanguages;
      if (!supportedLanguages) {
        return;
      }
      this.languageCodeInput.appendChild(option({ value: "" }, ["Select a language"]));
      for (const [name, code] of this.model.supportedLanguages) {
        this.languageCodeInput.appendChild(
          option(
            {
              value: code,
            },
            [name]
          )
        );
      }
    });
    garbageCollectUnusedFiles(this.model.fontList);

    const columnDescriptions = [
      {
        key: "uplodadedFileName",
        title: "file name",
      },
    ];
    this.filesUIList = new UIList();

    this.filesUIList.columnDescriptions = columnDescriptions;
    this.filesUIList.itemEqualFunc = (a, b) => a.fontIdentifier == b.fontIdentifier;

    this.filesUIList.minHeight = "6em";

    this.filesUIList.onFilesDrop = (files) => this._filesDropHandler(files);

    this.filesUIList.addEventListener("listSelectionChanged", () =>
      this._listSelectionChangedHandler()
    );

    this.filesUIList.addEventListener("deleteKey", () =>
      this._deleteSelectedItemHandler()
    );
    this.filesUIList.addEventListener("deleteKeyAlt", () => this._deleteAllHandler());

    this.filesUIList.setItems([...this.model.fontList]);
    if (this.model.selectedFontIndex != -1) {
      this.filesUIList.setSelectedItemIndex(this.model.selectedFontIndex, true);
    }

    this.languageCodeInput = select(
      {
        id: "language-code",
        style: "width: 100%;",
        onchange: (event) => {
          this.model.languageCode = event.target.value;
        },
      },
      []
    );

    return html.div(
      {
        class: "sidebar-reference-font",
      },
      [
        html.div(
          {
            id: "reference-font",
          },
          [
            div({ class: "title" }, ["Reference font"]),
            div({}, [
              "Drop one or more .ttf, .otf, .woff or .woff2 files in the field below:",
            ]),
            this.filesUIList,
            div(
              {
                style: `
                display: grid;
                grid-template-columns: max-content auto;
                align-items: center;
                gap: 0.666em;
                `,
              },
              [
                label({ for: "char-override" }, "Custom character:"),
                input({
                  type: "text",
                  id: "char-override",
                  value: this.model.charOverride,
                  oninput: (event) => (this.model.charOverride = event.target.value),
                }),
                label({ for: "language-code" }, "Language code:"),
                this.languageCodeInput,
              ]
            ),
          ]
        ),
      ]
    );
  }

  attach() {
    fetchJSON("/editor/language-mapping.json").then((languageMapping) => {
      this.languageMapping = languageMapping;
    });

    this.controller.addKeyListener("referenceFontName", (event) => {
      if (event.newValue) {
        this.editorController.visualizationLayersSettings.model[
          "fontra.reference.font"
        ] = true;
      }
      this.editorController.canvasController.requestUpdate();
    });
    this.controller.addKeyListener("charOverride", (event) => {
      this.editorController.canvasController.requestUpdate();
    });

    this.controller.addKeyListener("languageCode", (event) => {
      this.editorController.canvasController.setLangAttribute(this.model.languageCode);
    });

    this.editorController.canvasController.setLangAttribute(this.model.languageCode);

    referenceFontModel = this.model;
  }
}

customElements.define("panel-reference-font", ReferenceFontPanel);
