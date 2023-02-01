import chai from 'chai';
const expect = chai.expect;

import { ValueController } from '../src/fontra/client/core/value-controller.js';

describe('ValueController Tests', () => {
  it('basic tests', async () => {
    const vc = new ValueController();
    const result1 = [];
    const result2 = [];
    const result3 = [];
    vc.addObserver('obs1', (value) => result1.push(value));
    vc.addObserver('obs2', (value) => result2.push(value));
    vc.addObserver('obs3', (value) => result3.push(value));
    vc.set(100, 'obs1');

    expect(vc.value).to.equal(100);
    expect(() => (vc.value = 123)).to.throw('Cannot set property value');

    vc.set(200, 'obs2');
    vc.set(300);
    await asyncTimeout(0); // Give the event loop time to handle the events
    expect(result1).to.deep.equal([200, 300]);
    expect(result2).to.deep.equal([100, 300]);
    expect(result3).to.deep.equal([100, 200, 300]);

    vc.removeObserver('obs1');
    vc.set(20, 'obs2');
    vc.set(30);
    await asyncTimeout(0); // Give the event loop time to handle the events

    expect(result1).to.deep.equal([200, 300]);
    expect(result2).to.deep.equal([100, 300, 30]);
    expect(result3).to.deep.equal([100, 200, 300, 20, 30]);

    expect(() => vc.set(10, 'obs1')).to.throw("can't set value: unknown observerID");
  });

  it('falsey observerID throw test', async () => {
    const vc = new ValueController();
    expect(() => vc.addObserver()).to.throw('missing/falsey observerID argument');
    expect(() => vc.addObserver(null)).to.throw('missing/falsey observerID argument');
    expect(() => vc.addObserver(undefined)).to.throw(
      'missing/falsey observerID argument'
    );
    expect(() => vc.addObserver('')).to.throw('missing/falsey observerID argument');
  });

  it('double observe throw test', async () => {
    const vc = new ValueController(1);
    const obs1 = vc.addObserver('obs1');
    expect(() => vc.addObserver('obs1')).to.throw('observerID must be unique');
  });
});

function asyncTimeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
