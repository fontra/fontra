import { expect } from "chai";

import type { Listener } from "@fontra/core/observable-object.ts";
import { ObservableController } from "@fontra/core/observable-object.ts";

describe("ObservableObject Tests", () => {
  it("change value test", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    controller.addListener((event) => {
      result[event.key] = event.newValue as number;
    });
    controller.model.b = 200;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 200 });
  });

  it("change value test new key", async () => {
    const controller = new ObservableController({ a: 1, b: 2 } as Record<
      string,
      number
    >);
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    controller.addListener((event) => {
      expect(event.oldValue).to.equal(undefined);
      result[event.key] = event.newValue as number;
    });
    controller.model.c = 200;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 2, c: 200 });
  });

  it("change value test with key listener", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    controller.addKeyListener("b", (event) => {
      expect(event.key).to.equal("b");
      result[event.key] = event.newValue as number;
    });
    controller.model.a = 9999;
    controller.model.b = 200;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 200 });
  });

  it("change value test setItem", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    expect(controller.model).to.deep.equal({ a: 1, b: 2 });
    const result = { ...controller.model };
    controller.addListener((event) => {
      result[event.key] = event.newValue as number;
    });
    controller.setItem("b", 200);
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1, b: 200 });
  });

  it("delete item test", async () => {
    const controller = new ObservableController({ a: 1, b: 2 } as {
      a: number;
      b?: number;
    });
    const result = { ...controller.model };
    controller.addListener((event) => {
      expect(event.newValue).to.equal(undefined);
      delete result[event.key];
    });
    delete controller.model.b;
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 1 });
  });

  it("removeEventListener test", async () => {
    const controller = new ObservableController({ a: 1, b: 2 });
    const result = { ...controller.model };
    const callback: Listener<typeof controller.model> = (event) => {
      result[event.key] = event.newValue as number;
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
    controller.addListener((event) => {
      if (event.senderInfo !== senderInfo) {
        result[event.key] = event.newValue as number;
      }
    });
    controller.setItem("a", 300);
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
    controller.setItem("b", 300, senderInfo);
    await asyncTimeout(0);
    expect(result).to.deep.equal({ a: 300, b: 2 });
  });
});

function asyncTimeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
