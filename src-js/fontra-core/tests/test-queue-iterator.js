import { expect } from "chai";

import { QueueIterator } from "@fontra/core/queue-iterator.js";

describe("QueueIterator Tests", () => {
  it("immediate item, immediate done", async () => {
    const queue = new QueueIterator();
    queue.put(111);
    queue.done();
    const items = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).to.deep.equal([111]);
  });

  it("immediate item, delayed done", async () => {
    const queue = new QueueIterator();
    queue.put(111);
    setTimeout(() => {
      queue.done();
    }, 3);
    const items = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).to.deep.equal([111]);
  });

  it("delayed item, immediate done", async () => {
    const queue = new QueueIterator();
    setTimeout(() => {
      queue.put(111);
      queue.done();
    }, 3);
    const items = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).to.deep.equal([111]);
  });

  it("delayed item, delayed done", async () => {
    const queue = new QueueIterator();
    setTimeout(() => {
      queue.put(111);
    }, 3);
    setTimeout(() => {
      queue.done();
    }, 6);
    const items = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).to.deep.equal([111]);
  });

  it("multiple immediate items", async () => {
    const queue = new QueueIterator();
    queue.put(111);
    queue.put(112);
    queue.put(113);
    queue.done();
    const items = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).to.deep.equal([111, 112, 113]);
  });

  it("multiple delayed items", async () => {
    const queue = new QueueIterator();
    setTimeout(() => {
      queue.put(111);
      queue.put(112);
      queue.put(113);
      queue.done();
    }, 3);
    const items = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).to.deep.equal([111, 112, 113]);
  });

  it("multiple timed delayed items", async () => {
    const queue = new QueueIterator();
    setTimeout(() => {
      queue.put(111);
    }, 3);
    setTimeout(() => {
      queue.put(112);
    }, 6);
    setTimeout(() => {
      queue.put(113);
    }, 9);
    setTimeout(() => {
      queue.done();
    }, 12);
    const items = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).to.deep.equal([111, 112, 113]);
  });

  it("queue full error", async () => {
    const queue = new QueueIterator(1);
    queue.put(111);
    expect(() => queue.put(112)).to.throw("can't put item: queue is full");
  });

  it("queue done error", async () => {
    const queue = new QueueIterator(1);
    queue.done();
    expect(() => queue.put(112)).to.throw("can't put item: queue is done");
  });
});
