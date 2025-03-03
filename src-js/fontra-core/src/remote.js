import { RemoteError } from "./errors.js";

export async function getRemoteProxy(wsURL) {
  const remote = new RemoteObject(wsURL);
  await remote._connect();
  const remoteProxy = new Proxy(remote, {
    get: (remote, propertyName) => {
      if (propertyName === "then" || propertyName === "toJSON") {
        // Some introspection tries to see whether we can do "then",
        // and will treat us as a promise...
        return undefined;
      }
      if (propertyName in remote) {
        return remote[propertyName];
      }
      return (...args) => {
        return remote._doCall(propertyName, args);
      };
    },
    set: (remote, propertyName, value) => {
      remote[propertyName] = value;
      return true;
    },
  });
  return remoteProxy;
}

export class RemoteObject {
  constructor(wsURL) {
    if (crypto.randomUUID) {
      this.clientUUID = crypto.randomUUID();
    } else {
      this.clientUUID = randomUUIDFallback();
    }

    this.wsURL = wsURL;
    this._callReturnCallbacks = {};
    this._handlers = {
      close: this._default_onclose,
      error: this._default_onerror,
      messageFromServer: undefined,
      externalChange: undefined,
      reloadData: undefined,
    };

    const g = _genNextClientCallID();
    this._getNextClientCallID = () => {
      return g.next().value;
    };

    document.addEventListener(
      "visibilitychange",
      (event) => {
        if (document.visibilityState === "visible" && this.websocket.readyState > 1) {
          // console.log("wake reconnect");
          this._connect();
        }
      },
      false
    );
  }

  on(event, callback) {
    if (this._handlers.hasOwnProperty(event)) {
      this._handlers[event] = callback;
    } else {
      console.error(`Ignoring attempt to register handler for unknown event: ${event}`);
    }
  }

  async _trigger(event, ...args) {
    if (this._handlers.hasOwnProperty(event)) {
      return await this._handlers[event](...args);
    } else {
      throw new Error(`Recieved unknown event from server: ${event}`);
    }
  }

  _connect() {
    if (this._connectPromise !== undefined) {
      // websocket is still connecting/opening, return the same promise
      return this._connectPromise;
    }
    if (this.websocket?.readyState <= 1) {
      throw new Error("assert -- trying to open new websocket while we still have one");
    }
    this.websocket = new WebSocket(this.wsURL);
    this.websocket.onmessage = (event) => this._handleIncomingMessage(event);
    this._connectPromise = new Promise((resolve, reject) => {
      this.websocket.onopen = (event) => {
        resolve(event);
        delete this._connectPromise;
        this.websocket.onclose = (event) => this._trigger("close", event);
        this.websocket.onerror = (event) => this._trigger("error", event);
        const message = {
          "client-uuid": this.clientUUID,
        };
        this.websocket.send(JSON.stringify(message));
      };
      this.websocket.onerror = reject;
    });
    return this._connectPromise;
  }

  _default_onclose(event) {
    console.log(`websocket closed`, event);
  }

  _default_onerror(event) {
    console.log(`websocket error`, event);
  }

  async _handleIncomingMessage(event) {
    const message = JSON.parse(event.data);
    const clientCallID = message["client-call-id"];
    const serverCallID = message["server-call-id"];

    // console.log("incoming message");
    // console.log(message);
    if (clientCallID !== undefined) {
      // this is a response to a client -> server call
      const returnCallbacks = this._callReturnCallbacks[clientCallID];
      if (message["exception"] !== undefined) {
        returnCallbacks.reject(new RemoteError(message["exception"]));
      } else {
        returnCallbacks.resolve(message["return-value"]);
      }
      delete this._callReturnCallbacks[clientCallID];
    } else if (serverCallID !== undefined) {
      // this is an incoming server -> client call
      let returnMessage;
      try {
        let method = message["method-name"];
        if (!this._handlers.hasOwnProperty(method)) {
          throw new Error(`undefined method: ${method}`);
        }
        const returnValue = await this._trigger(method, ...message["arguments"]);
        returnMessage = {
          "server-call-id": serverCallID,
          "return-value": returnValue,
        };
      } catch (error) {
        console.log("exception in method call", error.toString());
        console.error(error, error.stack);
        returnMessage = { "server-call-id": serverCallID, "error": error.toString() };
      }
      this.websocket.send(JSON.stringify(returnMessage));
    }
  }

  async _doCall(methodName, args) {
    // console.log("--- doCall", methodName);
    const clientCallID = this._getNextClientCallID();
    const message = {
      "client-call-id": clientCallID,
      "method-name": methodName,
      "arguments": args,
    };
    if (this.websocket.readyState !== 1) {
      // console.log("waiting for reconnect");
      await this._connect();
    }
    this.websocket.send(JSON.stringify(message));

    this._callReturnCallbacks[clientCallID] = {};
    return new Promise((resolve, reject) => {
      this._callReturnCallbacks[clientCallID].resolve = resolve;
      this._callReturnCallbacks[clientCallID].reject = reject;
    });
  }
}

function* _genNextClientCallID() {
  let clientCallID = 0;
  while (true) {
    yield clientCallID;
    clientCallID++;
  }
}

function randomUUIDFallback() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
}
