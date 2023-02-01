import { RemoteError } from './errors.js';

export async function getRemoteProxy(wsURL) {
  const remote = new RemoteObject(wsURL);
  await remote.connect();
  const remoteProxy = new Proxy(remote, {
    get: (remote, propertyName) => {
      if (propertyName === 'then' || propertyName === 'toJSON') {
        // Some introspection tries to see whether we can do "then",
        // and will treat us as a promise...
        return undefined;
      }
      return (...args) => {
        return remote.doCall(propertyName, args);
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

    const g = _genNextClientCallID();
    this._getNextClientCallID = () => {
      return g.next().value;
    };

    document.addEventListener(
      'visibilitychange',
      (event) => {
        if (
          document.visibilityState === 'visible' &&
          this.websocket.readyState > 1
        ) {
          // console.log("wake reconnect");
          this.connect();
        }
      },
      false
    );
  }

  connect() {
    if (this._connectPromise !== undefined) {
      // websocket is still connecting/opening, return the same promise
      return this._connectPromise;
    }
    if (this.websocket?.readyState <= 1) {
      throw new Error(
        'assert -- trying to open new websocket while we still have one'
      );
    }
    this.websocket = new WebSocket(this.wsURL);
    this.websocket.onmessage = (event) => this._handleIncomingMessage(event);
    this._connectPromise = new Promise((resolve, reject) => {
      this.websocket.onopen = (event) => {
        resolve(event);
        delete this._connectPromise;
        const message = {
          'client-uuid': this.clientUUID,
        };
        this.websocket.send(JSON.stringify(message));
      };
      this.websocket.onerror = reject;
    });
    return this._connectPromise;
  }

  async _handleIncomingMessage(event) {
    const message = JSON.parse(event.data);
    const clientCallID = message['client-call-id'];
    const serverCallID = message['server-call-id'];

    // console.log("incoming message");
    // console.log(message);
    if (clientCallID !== undefined) {
      // this is a response to a client -> server call
      const returnCallbacks = this._callReturnCallbacks[clientCallID];
      if (message['exception'] !== undefined) {
        returnCallbacks.reject(new RemoteError(message['exception']));
      } else {
        returnCallbacks.resolve(message['return-value']);
      }
      delete this._callReturnCallbacks[clientCallID];
    } else if (serverCallID !== undefined) {
      // this is an incoming server -> client call
      if (this.receiver) {
        let returnMessage;
        try {
          let method = this.receiver[message['method-name']];
          if (method === undefined) {
            throw new Error(
              `undefined receiver method: ${message['method-name']}`
            );
          }
          method = method.bind(this.receiver);
          const returnValue = await method(...message['arguments']);
          returnMessage = {
            'server-call-id': serverCallID,
            'return-value': returnValue,
          };
        } catch (error) {
          console.log('exception in receiver call', error.toString());
          console.error(error, error.stack);
          returnMessage = {
            'server-call-id': serverCallID,
            error: error.toString(),
          };
        }
        this.websocket.send(JSON.stringify(returnMessage));
      } else {
        console.log('no receiver in place to receive server messages', message);
      }
    }
  }

  async doCall(methodName, args) {
    // console.log("--- doCall", methodName);
    const clientCallID = this._getNextClientCallID();
    const message = {
      'client-call-id': clientCallID,
      'method-name': methodName,
      arguments: args,
    };
    if (this.websocket.readyState !== 1) {
      // console.log("waiting for reconnect");
      await this.connect();
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
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
}
