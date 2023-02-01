import chai from 'chai';
const expect = chai.expect;

import { Transform } from '../src/fontra/client/core/transform.js';

describe('transform tests', () => {
  it('identity', () => {
    const t = new Transform();
    expect(t.toArray()).to.deep.equal([1, 0, 0, 1, 0, 0]);
  });

  it('constructor', () => {
    const t = new Transform(2, 0.2, 0.5, 0.5, 0.1, 2.3);
    expect(t.toArray()).to.deep.equal([2, 0.2, 0.5, 0.5, 0.1, 2.3]);
  });

  it('transformPoint', () => {
    let t = new Transform();
    t = t.scale(2.5, 5.5);
    expect(t.transformPoint(100, 100)).to.deep.equal([250, 550]);
  });

  it('translate', () => {
    let t = new Transform();
    t = t.translate(20, 30);
    expect(t.toArray()).to.deep.equal([1, 0, 0, 1, 20, 30]);
  });

  it('scale', () => {
    const t = new Transform();
    expect(t.scale(5).toArray()).to.deep.equal([5, 0, 0, 5, 0, 0]);
    expect(t.scale(5, 6).toArray()).to.deep.equal([5, 0, 0, 6, 0, 0]);
  });

  it('rotate', () => {
    const t = new Transform();
    expect(t.rotate(Math.PI / 2).toArray()).to.deep.equal([0, 1, -1, 0, 0, 0]);
  });

  it('skew', () => {
    const t = new Transform();
    expect(t.skew(Math.PI / 4).toArray()).to.deep.equal([
      1, 0, 0.9999999999999999, 1, 0, 0,
    ]);
  });

  it('transform', () => {
    const t = new Transform(2, 0, 0, 3, 1, 6);
    expect(
      t.transform({ xx: 4, xy: 3, yx: 2, yy: 1, dx: 5, dy: 6 }).toArray()
    ).to.deep.equal([8, 9, 4, 3, 11, 24]);
    expect(t.transform([4, 3, 2, 1, 5, 6]).toArray()).to.deep.equal([
      8, 9, 4, 3, 11, 24,
    ]);
  });

  it('reverseTransform', () => {
    let t = new Transform(2, 0, 0, 3, 1, 6);
    t = t.reverseTransform([4, 3, 2, 1, 5, 6]);
    expect(t.toArray()).to.deep.equal([8, 6, 6, 3, 21, 15]);
    t = new Transform(4, 3, 2, 1, 5, 6);
    t = t.transform([2, 0, 0, 3, 1, 6]);
    expect(t.toArray()).to.deep.equal([8, 6, 6, 3, 21, 15]);
  });

  it('inverse', () => {
    const t = new Transform().translate(2, 3).scale(4, 5);
    expect(t.transformPoint(10, 20)).to.deep.equal([42, 103]);
    const it = t.inverse();
    expect(it.transformPoint(42, 103)).to.deep.equal([10, 20]);
  });
});
