import { expect } from "chai";

import { LRUCache } from "@fontra/core/lru-cache.js";

describe("LRUCache Tests", () => {
  it("empty", () => {
    const lru = new LRUCache(4);
    expect(lru.size).to.equal(0);
    expect(lru._dllLength()).to.equal(0);
  });

  it("put/get", () => {
    let deletedKey;
    const lru = new LRUCache(4);
    lru.put("a", 1);
    lru.put("b", 2);
    expect(lru.size).to.equal(2);
    expect(lru._dllLength()).to.equal(lru.map.size);
    expect(lru.get("c")).to.equal(undefined);
    expect(lru.get("a")).to.equal(1);
    expect(lru.get("b")).to.equal(2);
    expect(lru.get("c")).to.equal(undefined);
    lru.put("c", 3);
    deletedKey = lru.put("d", 4);
    expect(deletedKey).to.equal(undefined);
    expect(lru.get("a")).to.equal(1);
    expect(lru.get("b")).to.equal(2);
    expect(lru.get("c")).to.equal(3);
    deletedKey = lru.put("e", 4);
    expect(deletedKey).to.deep.equal({ key: "d", value: 4 });
    expect(lru.get("d")).to.equal(undefined);
    expect(lru.get("a")).to.equal(1);
    lru.put("f", 5);
    expect(lru.get("b")).to.equal(undefined);
    expect(lru.get("a")).to.equal(1);
  });

  it("delete", () => {
    const lru = new LRUCache(4);
    lru.put("a", 1);
    lru.put("b", 2);
    lru.put("c", 3);
    expect(Array.from(lru.keys())).to.deep.equal(["a", "b", "c"]);
    expect(Array.from(lru.values())).to.deep.equal([1, 2, 3]);
    expect(lru._dllKeys()).to.deep.equal(["a", "b", "c"]);
    lru.delete("b");
    expect(Array.from(lru.keys())).to.deep.equal(["a", "c"]);
    expect(Array.from(lru.values())).to.deep.equal([1, 3]);
    expect(lru._dllKeys()).to.deep.equal(["a", "c"]);
    expect(lru._dllLength()).to.equal(2);
    lru.delete("a");
    expect(Array.from(lru.keys())).to.deep.equal(["c"]);
    expect(Array.from(lru.values())).to.deep.equal([3]);
    expect(lru._dllKeys()).to.deep.equal(["c"]);
    expect(lru._dllLength()).to.equal(1);
    lru.delete("missing_key");
    expect(Array.from(lru.keys())).to.deep.equal(["c"]);
    expect(lru._dllKeys()).to.deep.equal(["c"]);
    expect(lru._dllLength()).to.equal(1);
    lru.delete("c");
    expect(Array.from(lru.keys())).to.deep.equal([]);
    expect(Array.from(lru.values())).to.deep.equal([]);
    expect(lru._dllKeys()).to.deep.equal([]);
    expect(lru._dllLength()).to.equal(0);
  });
});
