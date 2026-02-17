import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { simpleMode } from "@codemirror/legacy-modes/mode/simple-mode";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { compare, scheduleCalls } from "@fontra/core/utils.js";
import { themeColorCSS } from "@fontra/web-components/theme-support.js";
import { Tag } from "@lezer/highlight";
import { BaseInfoPanel } from "./panel-base.js";

const colors = {
  "comment-color": ["#676e78", "#a2a2a2"],
  "keyword-color": ["#0b57d0", "#75bfff"],
  "glyph-class-color": ["#b90063", "#ff7de9"],
  "named-glyph-class-color": ["#198639", "#86de74"],
  "glyph-range-color": ["#b95a00", "#ffbe7d"],
  "feature-error-box-color": ["#f885", "#f885"],
  "feature-warning-box-color": ["#bf84", "#bf84"],
  "feature-error-highlight-color": ["#d665", "#d665"],
  "feature-warning-highlight-color": ["#6e44", "#6e44"],
};

addStyleSheet(`
  ${themeColorCSS(colors, ":root")}

#opentype-feature-code-panel {
  height: 100%;
}

.font-info-opentype-feature-code-container {
  display: grid;
  grid-template-rows: min-content auto min-content;
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  overflow: hidden;
}

.font-info-opentype-feature-code-header {
  display: grid;
  grid-template-columns: max-content auto;
  align-items: center;
  gap: 1em;
  font-weight: bold;
  padding: 0.6em 1em 0.6em 1em;
}

#font-info-opentype-feature-code-error-box {
  display: grid;
  grid-template-columns: auto;
  justify-content: stretch;
  gap: 0.2em;
  margin-top: 0.2em;
  max-height: 12em;
  overflow-y: auto;
}


#font-info-opentype-feature-code-error-box.hidden {
  display: none;
}

.font-info-opentype-feature-code-message-box {
  display: grid;
  grid-template-columns: min-content minmax(max-content, 12em) minmax(max-content, 4em) auto;
  justify-content: start;
  align-items: center;
  gap: 0.5em;
  padding: 0.2em 0.5em 0.2em 0.5em;
  border-radius: 0.5em;
  background-color: var(--feature-error-box-color);
  cursor: pointer;
}

.font-info-opentype-feature-code-message-box.warning {
  background-color: var(--feature-warning-box-color);
}

.font-info-opentype-feature-code-message-box > inline-svg {
  display: inline-block;
  width: 1.25em;
  height: 1.25em;
}

.font-info-opentype-feature-code-message-box > pre {
  margin: 0;
}

.font-info-opentype-feature-code-message-box .fea-error-highlight {
  font-weight: bold;
  background-color: var(--feature-warning-highlight-color);
}

.font-info-opentype-feature-code-message-box.error .fea-error-highlight {
  background-color: var(--feature-error-highlight-color);
}

.font-info-opentype-feature-code-show-more-less {
  justify-self: start;
  padding: 0em 1em 0.2em 1em;
  cursor: pointer;
}

#font-info-opentype-feature-code-text-entry-textarea {
  font-size: 1.1em;
  height: 100%;
  overflow: hidden;
}

#font-info-opentype-feature-code-text-entry-textarea > .cm-editor {
  height: 100%;
}

#font-info-opentype-feature-code-text-entry-textarea > .cm-scroller {
  overflow: auto;
}

#font-info-opentype-feature-code-text-entry-textarea > .cm-editor.cm-focused {
  outline: none;
}

`);

const openTypeFeatureCodeSimpleMode = simpleMode({
  start: [
    { regex: /#.*/, token: "comment" },
    {
      regex:
        /\b(?:anchor|anchorDef|anon|anonymous|by|contourpoint|cursive|device|enum|enumerate|exclude_dflt|feature|from|ignore|IgnoreBaseGlyphs|IgnoreLigatures|IgnoreMarks|include|include_dflt|language|languagesystem|lookup|lookupflag|mark|MarkAttachmentType|markClass|nameid|NULL|parameters|pos|position|required|reversesub|RightToLeft|rsub|script|sub|substitute|subtable|table|useExtension|useMarkFilteringSet|valueRecordDef|excludeDFLT|includeDFLT)\b/,
      token: "keyword",
    },
    {
      regex: /\[\s*(\\?[a-zA-Z0-9_.]+)\s*-\s*(\\?[a-zA-Z0-9_.]+)\s*\]/,
      token: "glyphRange",
    },
    {
      regex: /\[\s*\\?[a-zA-Z0-9_.-]+(?:\s+\\?[a-zA-Z0-9_.-]+)*\s*\]/,
      token: "glyphClass",
    },
    { regex: /@[a-zA-Z0-9_.-]+/, token: "namedGlyphClass" },
  ],
  languageData: {
    commentTokens: { line: "#" },
    autocomplete: myCompletions,
  },
});

openTypeFeatureCodeSimpleMode.tokenTable = {
  comment: Tag.define(),
  keyword: Tag.define(),
  glyphClass: Tag.define(),
  glyphRange: Tag.define(),
  namedGlyphClass: Tag.define(),
};

const openTypeFeatureCodeStreamLanguage = StreamLanguage.define(
  openTypeFeatureCodeSimpleMode
);

const openTypeFeatureCodeHighlighter = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: openTypeFeatureCodeSimpleMode.tokenTable.comment,
      color: "var(--comment-color)",
    },
    {
      tag: openTypeFeatureCodeSimpleMode.tokenTable.keyword,
      color: "var(--keyword-color)",
    },
    {
      tag: openTypeFeatureCodeSimpleMode.tokenTable.glyphClass,
      color: "var(--glyph-class-color)",
    },
    {
      tag: openTypeFeatureCodeSimpleMode.tokenTable.glyphRange,
      color: "var(--glyph-range-color)",
    },
    {
      tag: openTypeFeatureCodeSimpleMode.tokenTable.namedGlyphClass,
      color: "var(--named-glyph-class-color)",
    },
  ])
);

const openTypeFeatureLanguage = new LanguageSupport(openTypeFeatureCodeStreamLanguage, [
  openTypeFeatureCodeHighlighter,
]);

const customTheme = EditorView.theme({
  ".cm-cursor": {
    borderLeft: "2px solid var(--fontra-red-color)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--ui-element-background-color)",
    color: "var(--horizontal-rule-color)",
    borderRight: "1px solid var(--horizontal-rule-color)",
  },
  ".cm-activeLine": {
    backgroundColor: "#8D8D8D10",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--ui-element-foreground-color)",
  },
  ".cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "#BBB5",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "#A6CCF250",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--background-color)",
    border: "0.5px solid gray",
    borderRadius: "4px",
    boxShadow: "2px 3px 10px #00000020",
    padding: "0.5em 0",
    fontFamily: "monospace",
    fontSize: "1.1em",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: "var(--fontra-red-color)",
    },
  },
  ".cm-tooltip.cm-completionInfo": {
    fontSize: "1em",
    padding: "0.5em 0.8em 0.7em 0.8em",
  },
});

export class OpenTypeFeatureCodePanel extends BaseInfoPanel {
  static title = "opentype-feature-code.title";
  static id = "opentype-feature-code-panel";
  static fontAttributes = ["features"];

  async setupUI() {
    this.updateFeatureCode = scheduleCalls(
      (update) => this._updateFeatureCode(update),
      350
    );
    const features = await this.fontController.getFeatures();
    this.panelElement.innerHTML = "";
    const container = html.div(
      { class: "font-info-opentype-feature-code-container" },
      []
    );
    container.appendChild(
      html.div({ class: "font-info-opentype-feature-code-header" }, [
        "OpenType Feature Code", // TODO: translation
      ])
    );

    const editorContainer = html.div(
      { id: "font-info-opentype-feature-code-text-entry-textarea" },
      []
    );

    const customSetup = (() => [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
    ])();

    this.editorView = new EditorView({
      doc: features.text,
      extensions: [
        openTypeFeatureLanguage,
        customSetup,
        customTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.updateFeatureCode(update);
          }
        }),
      ],
      parent: editorContainer,
    });

    container.appendChild(editorContainer);

    this.panelElement.appendChild(container);

    container.appendChild(
      html.div({ id: "font-info-opentype-feature-code-error-box", class: "hidden" }, [
        "",
      ])
    );

    this.showAllErrors = false;
    await this.checkCompileErrors();
  }

  async _updateFeatureCode(update) {
    const undoLabel = "edit OpenType feature code"; // TODO: translation
    const changes = await this.fontController.performEdit(
      undoLabel,
      "features",
      (root) => {
        root.features.text = update.state.doc.toString();
      }
    );

    await this.checkCompileErrors();
  }

  async checkCompileErrors() {
    const { errors, messages, formattedMessages } =
      await this.fontController.getShaperFontData(true);

    const errorElement = document.querySelector(
      "#font-info-opentype-feature-code-error-box"
    );

    errorElement.innerText = "";

    // Messages don't always arrived sorted by position in fea source
    messages.sort(feaMessageCompare);
    const numMessages = messages.length;

    for (const message of this.showAllErrors ? messages : messages.slice(0, 1)) {
      let [spanFrom, spanTo] = message.span;
      const lineInfo = this.editorView.state.doc.lineAt(spanFrom);
      spanTo = Math.min(spanTo, lineInfo.to);
      const spanInLineFrom = spanFrom - lineInfo.from;
      const spanInLineTo = spanTo - lineInfo.from;
      const isWarning = message.level == "warning";
      const isException = message.level == "exception";

      const lineNumberString = isException ? "" : `Line ${lineInfo.number}`;
      const lineItems = isException
        ? [""]
        : [
            lineInfo.text.slice(0, spanInLineFrom),
            html.span({ class: "fea-error-highlight" }, [
              lineInfo.text.slice(spanInLineFrom, spanInLineTo),
            ]),
            lineInfo.text.slice(spanInLineTo),
          ];

      errorElement.appendChild(
        html.div(
          {
            class: `font-info-opentype-feature-code-message-box ${message.level}`,
            onclick: () => (isException ? () => null : this.goToSpan(spanFrom, spanTo)),
          },
          [
            html.createDomElement("inline-svg", {
              class: "font-info-opentype-feature-code-error-icon",
              src: isWarning
                ? "/tabler-icons/alert-triangle.svg"
                : "/tabler-icons/bug.svg",
            }),
            message.text,
            html.div({ class: "fea-error-line-number" }, [lineNumberString]),
            html.pre({ class: "fea-error-line" }, lineItems),
          ]
        )
      );
    }

    if (numMessages > 1) {
      errorElement.appendChild(
        html.div(
          {
            class: "font-info-opentype-feature-code-show-more-less",
            onclick: (event) => {
              this.showAllErrors = !this.showAllErrors;
              this.checkCompileErrors();
            },
          },
          [this.showAllErrors ? "Show less..." : "Show more..."]
        )
      );
    }

    errorElement.classList.toggle("hidden", !messages.length);
  }

  goToSpan(spanFrom, spanTo) {
    this.editorView.dispatch({
      selection: EditorSelection.create([EditorSelection.range(spanTo, spanFrom)], 0),
      scrollIntoView: true,
    });

    this.editorView.focus();
  }

  getUndoRedoLabel(isRedo) {
    return isRedo ? "action.redo" : "action.undo";
  }

  canUndoRedo(isRedo) {
    return !!(isRedo
      ? redoDepth(this.editorView.state)
      : undoDepth(this.editorView.state));
  }

  async doUndoRedo(isRedo) {
    if (isRedo) {
      redo(this.editorView);
    } else {
      undo(this.editorView);
    }
  }
}

// For details, please see:
// https://codemirror.net/try/?example=Custom%20completions
const completions = [
  {
    label: "feature",
    type: "keyword",
    info: `Example:
    feature case {
      # lookups and rules
    } case;`,
    apply: `feature xxxx {
  # lookups and rules
} xxxx;`,
  },
  {
    label: "lookup",
    type: "keyword",
    info: `Example:
    lookup LookupName {
      # rules
    } LookupName;`,
    apply: `lookup LookupName {
  # rules
} LookupName`,
  },
  {
    label: "sub",
    type: "keyword",
    info: `Examples:
    sub A by A.ss01;
    sub [a b c] by [A.sc B.sc C.sc];
    sub @FIGURES_DFLT by @FIGURES_TLF ;`,
    detail: "substitution",
    // apply: `sub A by A.ss01;`,
  },
  {
    label: "pos",
    type: "keyword",
    info: `Example:
    pos @A V -100;`,
    detail: "position",
  },
  {
    label: "ignore",
    type: "keyword",
    info: `Example:
    ignore sub w o r' d s exclam;
    sub w o r' d s by r.alt;`,
  },
  {
    label: "script",
    type: "keyword",
    info: `Example:
    script latn;`,
  },
  {
    label: "language",
    type: "keyword",
    info: `Example:
    language TRK  exclude_dflt; # Turkish
    sub i by i.dot;`,
  },
  {
    label: "languagesystem",
    type: "keyword",
    info: `Example:
    languagesystem DFLT dflt;
    languagesystem latn AFK ;`,
  },
  // TODO: Extend with helpful completions
];

function myCompletions(context) {
  let before = context.matchBefore(/\w+/);
  if (!context.explicit && !before) return null;
  return {
    from: before ? before.from : context.pos,
    options: completions,
    validFor: /^\w*$/,
  };
}

function parseFeaMessages(messages) {
  const feaErrorRegex = /^in .+? at (\d+):(\d+)$/gm;

  const chunks = [{ startIndex: 0 }];

  while (true) {
    const result = feaErrorRegex.exec(messages);
    if (!result) {
      chunks.at(-1).endIndex = messages.length;
      break;
    }
    chunks.at(-1).endIndex = result.index;
    chunks.push({
      startIndex: result.index,
      lineNumber: parseInt(result[1]),
      charNumber: parseInt(result[2]),
    });
  }

  return chunks;
}

const feaMessageLevels = ["error", "warning", "info"];

function feaMessageCompare(a, b) {
  return (
    compare(feaMessageLevels.indexOf(a.level), feaMessageLevels.indexOf(b.level)) ||
    compare(a.span[0], b.span[0])
  );
}
