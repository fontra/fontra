import { getRemoteProxy } from "../core/remote.js";
import { makeDisplayPath } from "../core/view-tools.js";

export class FontInfoController {
  static async fromWebSocket() {
    const pathItems = window.location.pathname.split("/").slice(3);
    const displayPath = makeDisplayPath(pathItems);
    document.title = `Fontra Font Info — ${decodeURI(displayPath)}`;
    const projectPath = pathItems.join("/");
    const protocol = window.location.protocol === "http:" ? "ws" : "wss";
    const wsURL = `${protocol}://${window.location.host}/websocket/${projectPath}`;

    const remoteFontEngine = await getRemoteProxy(wsURL);
    const fontInfoController = new FontInfoController(remoteFontEngine);
    remoteFontEngine.receiver = fontInfoController;
    remoteFontEngine.onclose = (event) => fontInfoController.handleRemoteClose(event);
    remoteFontEngine.onerror = (event) => fontInfoController.handleRemoteError(event);
    await fontInfoController.start();
    return fontInfoController;
  }

  constructor(font) {
    this.font = font;
  }

  async start() {
    this.axes = await this.font.getGlobalAxes();
  }

  handleRemoteClose(event) {
    //
  }

  handleRemoteError(event) {
    //
  }
}
