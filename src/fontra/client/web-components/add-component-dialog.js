import { html, css, LitElement } from "https://cdn.jsdelivr.net/npm/lit@2.6.1/+esm";

export class addComponentDialog extends LitElement {
  static styles = css`
    * {
      font-family: fontra-ui-regular, sans-serif;
      font-size: 1.1rem;
    }

    .ui-dialog-content {
      position: relative;

      outline: none; /* to catch key events we need to focus, but we don't want a focus border */
      min-width: 16em;
      max-width: 32em;
      overflow-wrap: normal;
      font-size: 1.15em;
      background-color: var(--editor-overlay-item-background-color);
      padding: 1em;
      border-radius: 0.5em;
      box-shadow: 1px 3px 8px #0006;
    }

    .glyphs-search-input {
      border-radius: 2em;
      height: 1.8em;
      box-sizing: border-box;
      width: 100%;
      background-color: var(--editor-glyphs-search-input-background-color);
      color: var(--editor-glyphs-search-input-foreground-color);
      border: none;
      padding-left: 0.8em;
      padding-right: 0.8em;
    }

    .ui-list {
      margin: 1em 0;
      overflow: scroll;
      border: solid 1px var(--ui-list-border-color);
    }

    .ui-list > .contents {
      display: flex;
      flex-direction: column;
      max-height: 20em;
    }

    .ui-list > .contents > .row {
      display: flex;
      width: content;
      border-top: solid 1px var(--ui-list-row-border-color);
      color: var(--ui-list-row-foreground-color);
      background-color: var(--ui-list-row-background-color);
      padding: 0.15em;
      padding-left: 0.5em;
      padding-right: 0.5em;
      cursor: pointer;
    }

    .ui-list > .contents > .selected {
      background-color: var(--ui-list-row-selected-background-color);
    }

    .ui-list > .contents > .row > .text-cell {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .buttons {
      display: flex;
      justify-content: end;
      gap: 1em;
    }

    .ui-dialog-button {
      color: white;
      background-color: gray;

      border-radius: 1em;
      padding: 0.35em 2em 0.35em 2em;

      border: none;
      font-family: fontra-ui-regular;
      font-size: 1em;
      text-align: center;
      transition: 100ms;
    }

    .ui-dialog-button:hover {
      cursor: pointer;
      filter: brightness(1.15);
    }

    .ui-dialog-button:active {
      filter: brightness(0.9);
    }

    .ui-dialog-button.default {
      background-color: var(--fontra-red-color);
    }
  `;

  static properties = {
    addComponentCallback: { type: Function },
  };
  constructor(container) {
    super();
    this.addComponentCallback = () => {};
    this.glyphList = this.buildGlyphList();
    this.container = container;
    this.container.appendChild(this);
    this.container.classList.add("visible");
  }

  render() {
    return html`
      <section class="ui-dialog-content">
        <input
          type="text"
          class="glyphs-search-input"
          placeholder="Search glyphs"
          autocomplete="off"
          autofocus="true"
        />
        <div class="ui-list glyph-list">
          <div class="contents">${this.glyphList}</div>
        </div>
        <div class="buttons">
          <button
            class="ui-dialog-button"
            name="cancel-button"
            @click=${() => this.dismissDialog()}
          >
            Cancel
          </button>
          <button
            class="ui-dialog-button default"
            name="add-button"
            @click=${() => this.addComponent()}
          >
            Add
          </button>
        </div>
      </section>
    `;
  }

  buildGlyphList() {
    // TODO: implement proper data
    return html`<div class="row" data-row-index="0">
        <div class="text-cell char" style="width: 2em;"></div>
        <div class="text-cell glyphName" style="width: 10em;">space</div>
        <div class="text-cell unicode" style="width: 5em;">U+0020</div>
      </div>
      <div class="row" data-row-index="1">
        <div class="text-cell char" style="width: 2em;">,</div>
        <div class="text-cell glyphName" style="width: 10em;">comma</div>
        <div class="text-cell unicode" style="width: 5em;">U+002C</div>
      </div>
      <div class="row" data-row-index="2">
        <div class="text-cell char" style="width: 2em;">´</div>
        <div class="text-cell glyphName" style="width: 10em;">acute</div>
        <div class="text-cell unicode" style="width: 5em;">U+00B4</div>
      </div>
      <div class="row" data-row-index="3">
        <div class="text-cell char" style="width: 2em;">Á</div>
        <div class="text-cell glyphName" style="width: 10em;">Aacute</div>
        <div class="text-cell unicode" style="width: 5em;">U+00C1</div>
      </div>
      <div class="row" data-row-index="4">
        <div class="text-cell char" style="width: 2em;">‚</div>
        <div class="text-cell glyphName" style="width: 10em;">quotesinglbase</div>
        <div class="text-cell unicode" style="width: 5em;">U+201A</div>
      </div>
      <div class="row" data-row-index="5">
        <div class="text-cell char" style="width: 2em;">„</div>
        <div class="text-cell glyphName" style="width: 10em;">quotedblbase</div>
        <div class="text-cell unicode" style="width: 5em;">U+201E</div>
      </div>
      <div class="row" data-row-index="6">
        <div class="text-cell char" style="width: 2em;">←</div>
        <div class="text-cell glyphName" style="width: 10em;">arrowleft</div>
        <div class="text-cell unicode" style="width: 5em;">U+2190</div>
      </div>
      <div class="row" data-row-index="7">
        <div class="text-cell char" style="width: 2em;">↑</div>
        <div class="text-cell glyphName" style="width: 10em;">arrowup</div>
        <div class="text-cell unicode" style="width: 5em;">U+2191</div>
      </div>
      <div class="row" data-row-index="8">
        <div class="text-cell char" style="width: 2em;">→</div>
        <div class="text-cell glyphName" style="width: 10em;">arrowright</div>
        <div class="text-cell unicode" style="width: 5em;">U+2192</div>
      </div>
      <div class="row" data-row-index="9">
        <div class="text-cell char" style="width: 2em;">↓</div>
        <div class="text-cell glyphName" style="width: 10em;">arrowdown</div>
        <div class="text-cell unicode" style="width: 5em;">U+2193</div>
      </div>
      <div class="row" data-row-index="10">
        <div class="text-cell char" style="width: 2em;"></div>
        <div class="text-cell glyphName" style="width: 10em;">I.narrow</div>
        <div class="text-cell unicode" style="width: 5em;"></div>
      </div>
      <div class="row" data-row-index="11">
        <div class="text-cell char" style="width: 2em;"></div>
        <div class="text-cell glyphName" style="width: 10em;">J.narrow</div>
        <div class="text-cell unicode" style="width: 5em;"></div>
      </div>
      <div class="row" data-row-index="12">
        <div class="text-cell char" style="width: 2em;"></div>
        <div class="text-cell glyphName" style="width: 10em;">varcotest1</div>
        <div class="text-cell unicode" style="width: 5em;"></div>
      </div>
      <div class="row" data-row-index="13">
        <div class="text-cell char" style="width: 2em;"></div>
        <div class="text-cell glyphName" style="width: 10em;">varcotest2</div>
        <div class="text-cell unicode" style="width: 5em;"></div>
      </div>`;
  }

  addComponent() {
    this.addComponentCallback();
    this.dismissDialog();
  }

  dismissDialog() {
    this.container.removeChild(this);
    this.container.classList.remove("visible");
  }
}

customElements.define("add-component-dialog", addComponentDialog);
