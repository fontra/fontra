import { expect } from "chai";

import { ObservableController } from "@fontra/core/observable-object.js";

describe("ObservableObject Tests", () => {
  it("change value test", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (event) => {
      result[event.key] = event.newValue;
    };
    controller.addListener(callback);
    controller.model.b = 200;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 200 });
  });

  it("change value test new key", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (event) => {
      expect(event.oldValue).to.equal(undefined);
      result[event.key] = event.newValue;
    };
    controller.addListener(callback);
    controller.model.c = 200;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 2, c: 200 });
  });

  it("change value test with key listener", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (event) => {
      expect(event.key).to.equal("b");
      result[event.key] = event.newValue;
    };
    controller.addKeyListener("b", callback);
    controller.model.a = 9999;
    controller.model.b = 200;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 200 });
  });

  it("change value test setItem", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (event) => {
      result[event.key] = event.newValue;
    };
    controller.addListener(callback);
    controller.setItem("b", 200);
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 200 });
  });

  it("delete item test", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (event) => {
      expect(event.newValue).to.equal(undefined);
      delete result[event.key];
    };
    controller.addListener(callback);
    delete controller.model.b;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1 });
  });

  it("removeEventListener test", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback = (event) => {
      result[event.key] = event.newValue;
    };
    controller.addListener(callback);
    controller.model.a = 300;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
    controller.removeListener(callback);
    controller.model.b = 300;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
  });

  it("setItem senderInfo test", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    const result = { ...controller.model };
    const senderInfo = {}; // arbitrary unique object
    const callback = (event) => {
      if (event.senderInfo !== senderInfo) {
        result[event.key] = event.newValue;
      }
    };
    controller.addListener(callback);
    controller.setItem("a", 300);
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
    controller.setItem("b", 300, senderInfo);
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
  });
});

function asyncTimeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
