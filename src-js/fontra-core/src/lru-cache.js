// based on https://www.section.io/engineering-education/lru-cache-implementation-in-javascript/

export class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map(); // this stores the entire array
    this.clear();
  }

  clear() {
    this.map.clear();
    // these are the boundaries for the double linked list
    this.head = {};
    this.tail = {};

    this.head.next = this.tail; // initialize the double linked list
    this.tail.prev = this.head;
  }

  has(key) {
    return this.map.has(key);
  }

  get(key) {
    const node = this.map.get(key);
    if (node !== undefined) {
      // remove elem from current position
      node.prev.next = node.next;
      node.next.prev = node.prev;

      this.tail.prev.next = node; // insert it after last element. Element before tail
      node.prev = this.tail.prev; // update node.prev and next pointer
      node.next = this.tail;
      this.tail.prev = node; // update last element as tail

      return node.value;
    } else {
      return undefined; // element does not exist
    }
  }

  put(key, value) {
    let deletedItem = undefined;
    if (this.get(key) !== undefined) {
      // if key does not exist, update last element value
      // (assert this.tail.prev.key === key)
      this.tail.prev.value = value;
    } else {
      // check if map size is at capacity
      if (this.map.size === this.capacity) {
        deletedItem = { key: this.head.next.key, value: this.head.next.value };
        //delete item both from map and DLL
        this.map.delete(deletedItem.key); // delete first element of list
        this.head.next = this.head.next.next; // update first element as next element
        this.head.next.prev = this.head;
      }

      const node = {
        value,
        key,
      }; // each node is a hashtable that stores key and value

      // when adding a new node, we need to update both map and DLL
      this.map.set(key, node); // add current node to map
      this.tail.prev.next = node; // add node to end of the list
      node.prev = this.tail.prev; // update prev and next pointers of node
      node.next = this.tail;
      this.tail.prev = node; // update last element
    }
    return deletedItem;
  }

  delete(key) {
    const node = this.map.get(key);
    if (node !== undefined) {
      //delete item both from map and DLL
      this.map.delete(node.key);
      node.prev.next = node.next;
      node.next.prev = node.prev;
    }
  }

  get size() {
    return this.map.size;
  }

  keys() {
    return this.map.keys();
  }

  *values() {
    for (const node of this._dllIter()) {
      yield node.value;
    }
  }

  _dllLength() {
    // the result of this function must match this.map.size;
    let count = 0;
    for (const node of this._dllIter()) {
      count++;
    }
    return count;
  }

  *_dllIter() {
    let node = this.head.next;
    while (node !== this.tail) {
      yield node;
      node = node.next;
    }
  }

  _dllKeys() {
    const keys = [];
    for (const node of this._dllIter()) {
      keys.push(node.key);
    }
    return keys;
  }
}
