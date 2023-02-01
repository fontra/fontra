import chai from 'chai';
const expect = chai.expect;

import {
  POINT_TYPE_OFF_CURVE_CUBIC,
  POINT_TYPE_OFF_CURVE_QUAD,
  VarPackedPath,
} from '../src/fontra/client/core/var-path.js';
import VarArray from '../src/fontra/client/core/var-array.js';
import { Transform } from '../src/fontra/client/core/transform.js';
import { enumerate } from '../src/fontra/client/core/utils.js';

class MockPath2D {
  constructor() {
    this.items = [];
  }
  moveTo(x, y) {
    this.items.push({ op: 'moveTo', args: [x, y] });
  }
  lineTo(x, y) {
    this.items.push({ op: 'lineTo', args: [x, y] });
  }
  bezierCurveTo(x1, y1, x2, y2, x3, y3) {
    this.items.push({ op: 'bezierCurveTo', args: [x1, y1, x2, y2, x3, y3] });
  }
  quadraticCurveTo(x1, y1, x2, y2) {
    this.items.push({ op: 'quadraticCurveTo', args: [x1, y1, x2, y2] });
  }
  closePath() {
    this.items.push({ op: 'closePath', args: [] });
  }
}

function simpleTestPath(isClosed = true) {
  return new VarPackedPath(
    new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
    [
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
    ],
    [{ endPoint: 3, isClosed: isClosed }]
  );
}

function complexTestPath() {
  const p = new VarPackedPath();
  p.coordinates = new VarArray(
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19
  );
  const on = VarPackedPath.ON_CURVE;
  const off = VarPackedPath.OFF_CURVE_QUAD;
  p.pointTypes = [on, off, on, on, on, on, on, off, off, on];
  p.contourInfo = [
    { endPoint: 2, isClosed: true },
    { endPoint: 5, isClosed: true },
    { endPoint: 9, isClosed: true },
  ];
  return p;
}

describe('VarPackedPath Tests', () => {
  it('empty copy', () => {
    const p = new VarPackedPath();
    expect(p.unpackedContours()).to.deep.equal([]);
    const p2 = p.copy();
    expect(p2.coordinates).to.deep.equal([]);
    expect(p2.pointTypes).to.deep.equal([]);
    expect(p2.contourInfo).to.deep.equal([]);
    expect(p2.unpackedContours()).to.deep.equal([]);
  });

  it('constructor', () => {
    const p = simpleTestPath();
    expect(p.coordinates).to.deep.equal([0, 0, 0, 100, 100, 100, 100, 0]);
    expect(p.pointTypes).to.deep.equal([
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
    ]);
    expect(p.contourInfo).to.deep.equal([{ endPoint: 3, isClosed: true }]);
  });

  it('copy', () => {
    const p = simpleTestPath();
    const p2 = p.copy();
    // modify original
    p.coordinates[0] = 1000;
    p.pointTypes[0] = VarPackedPath.OFF_CURVE_QUAD;
    p.contourInfo[0].isClosed = false;
    expect(p2.coordinates).to.deep.equal([0, 0, 0, 100, 100, 100, 100, 0]);
    expect(p2.pointTypes).to.deep.equal([
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
    ]);
    expect(p2.contourInfo).to.deep.equal([{ endPoint: 3, isClosed: true }]);
  });

  it('draw', () => {
    const p = simpleTestPath();
    expect(p.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 100 },
          { x: 100, y: 100 },
          { x: 100, y: 0 },
        ],
        isClosed: true,
      },
    ]);
  });

  it('open path', () => {
    const p = simpleTestPath(false);
    expect(p.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 100 },
          { x: 100, y: 100 },
          { x: 100, y: 0 },
        ],
        isClosed: false,
      },
    ]);
  });

  it('closed path dangling off curves', () => {
    const p = new VarPackedPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [
        VarPackedPath.OFF_CURVE_QUAD,
        VarPackedPath.ON_CURVE,
        VarPackedPath.OFF_CURVE_QUAD,
        VarPackedPath.ON_CURVE,
      ],
      [{ endPoint: 3, isClosed: true }]
    );
    expect(p.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 0, type: 'quad' },
          { x: 0, y: 100 },
          { x: 100, y: 100, type: 'quad' },
          { x: 100, y: 0 },
        ],
        isClosed: true,
      },
    ]);
  });

  it('open path dangling off curves', () => {
    const p = new VarPackedPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [
        VarPackedPath.OFF_CURVE_QUAD,
        VarPackedPath.ON_CURVE,
        VarPackedPath.OFF_CURVE_QUAD,
        VarPackedPath.ON_CURVE,
      ],
      [{ endPoint: 3, isClosed: false }]
    );

    expect(p.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 0, type: 'quad' },
          { x: 0, y: 100 },
          { x: 100, y: 100, type: 'quad' },
          { x: 100, y: 0 },
        ],
        isClosed: false,
      },
    ]);
  });

  it('quad', () => {
    const p = new VarPackedPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [
        VarPackedPath.ON_CURVE,
        VarPackedPath.OFF_CURVE_QUAD,
        VarPackedPath.OFF_CURVE_QUAD,
        VarPackedPath.OFF_CURVE_QUAD,
      ],
      [{ endPoint: 3, isClosed: true }]
    );

    expect(p.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 100, type: 'quad' },
          { x: 100, y: 100, type: 'quad' },
          { x: 100, y: 0, type: 'quad' },
        ],
        isClosed: true,
      },
    ]);

    const mp = new MockPath2D();
    p.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [0, 100, 50, 100], op: 'quadraticCurveTo' },
      { args: [100, 100, 100, 50], op: 'quadraticCurveTo' },
      { args: [100, 0, 0, 0], op: 'quadraticCurveTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('quad blob', () => {
    const p = new VarPackedPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [
        VarPackedPath.OFF_CURVE_QUAD,
        VarPackedPath.OFF_CURVE_QUAD,
        VarPackedPath.OFF_CURVE_QUAD,
        VarPackedPath.OFF_CURVE_QUAD,
      ],
      [{ endPoint: 3, isClosed: true }]
    );

    expect(p.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 0, type: 'quad' },
          { x: 0, y: 100, type: 'quad' },
          { x: 100, y: 100, type: 'quad' },
          { x: 100, y: 0, type: 'quad' },
        ],
        isClosed: true,
      },
    ]);

    const mp = new MockPath2D();
    p.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [50, 0], op: 'moveTo' },
      { args: [0, 0, 0, 50], op: 'quadraticCurveTo' },
      { args: [0, 100, 50, 100], op: 'quadraticCurveTo' },
      { args: [100, 100, 100, 50], op: 'quadraticCurveTo' },
      { args: [100, 0, 50, 0], op: 'quadraticCurveTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('cubic', () => {
    const p = new VarPackedPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [
        VarPackedPath.ON_CURVE,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.ON_CURVE,
      ],
      [{ endPoint: 3, isClosed: true }]
    );

    expect(p.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 100, type: 'cubic' },
          { x: 100, y: 100, type: 'cubic' },
          { x: 100, y: 0 },
        ],
        isClosed: true,
      },
    ]);

    const mp = new MockPath2D();
    p.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [0, 100, 100, 100, 100, 0], op: 'bezierCurveTo' },
      { args: [0, 0], op: 'lineTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('cubic 1 off-curve point', () => {
    const p = new VarPackedPath(
      new VarArray(0, 0, 0, 100, 100, 0),
      [
        VarPackedPath.ON_CURVE,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.ON_CURVE,
      ],
      [{ endPoint: 2, isClosed: true }]
    );
    expect(p._checkIntegrity()).to.equal(false);
    const mp = new MockPath2D();
    p.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [0, 100, 100, 0], op: 'quadraticCurveTo' },
      { args: [0, 0], op: 'lineTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('cubic 3 off-curve points', () => {
    const p = new VarPackedPath(
      new VarArray(0, 0, 0, 100, 55, 55, 100, 100, 100, 0),
      [
        VarPackedPath.ON_CURVE,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.ON_CURVE,
      ],
      [{ endPoint: 4, isClosed: true }]
    );
    expect(p._checkIntegrity()).to.equal(false);
    const mp = new MockPath2D();
    p.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [0, 100, 100, 100, 100, 0], op: 'bezierCurveTo' },
      { args: [0, 0], op: 'lineTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('add', () => {
    const p1 = new VarPackedPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [
        VarPackedPath.ON_CURVE,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.ON_CURVE,
      ],
      [{ endPoint: 3, isClosed: true }]
    );
    const p2 = p1.copy();
    const p3 = p1.addItemwise(p2);

    expect(p3.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 200, type: 'cubic' },
          { x: 200, y: 200, type: 'cubic' },
          { x: 200, y: 0 },
        ],
        isClosed: true,
      },
    ]);
  });

  it('sub', () => {
    const p1 = new VarPackedPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [
        VarPackedPath.ON_CURVE,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.ON_CURVE,
      ],
      [{ endPoint: 3, isClosed: true }]
    );
    const p2 = p1.copy();
    const p3 = p1.subItemwise(p2);

    expect(p3.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 0, type: 'cubic' },
          { x: 0, y: 0, type: 'cubic' },
          { x: 0, y: 0 },
        ],
        isClosed: true,
      },
    ]);
  });

  it('mul', () => {
    const p = new VarPackedPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [
        VarPackedPath.ON_CURVE,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.ON_CURVE,
      ],
      [{ endPoint: 3, isClosed: true }]
    );
    const mp = new MockPath2D();
    const p2 = p.mulScalar(2);

    expect(p2.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 200, type: 'cubic' },
          { x: 200, y: 200, type: 'cubic' },
          { x: 200, y: 0 },
        ],
        isClosed: true,
      },
    ]);
  });

  it('pen-ish methods', () => {
    const p = new VarPackedPath();
    const mp = new MockPath2D();
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.cubicCurveTo(30, 130, 70, 130, 100, 100);
    p.quadraticCurveTo(130, 70, 130, 30, 100, 0);
    p.closePath();
    p.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [0, 100], op: 'lineTo' },
      { args: [30, 130, 70, 130, 100, 100], op: 'bezierCurveTo' },
      { args: [130, 70, 130, 50], op: 'quadraticCurveTo' },
      { args: [130, 30, 100, 0], op: 'quadraticCurveTo' },
      { args: [0, 0], op: 'lineTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('iterPoints', () => {
    const p = new VarPackedPath(
      new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
      [
        VarPackedPath.ON_CURVE,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.OFF_CURVE_CUBIC,
        VarPackedPath.ON_CURVE,
      ],
      [{ endPoint: 3, isClosed: true }]
    );
    const points = [];
    for (const pt of p.iterPoints()) {
      points.push(pt);
    }
    expect(points).to.deep.equal([
      { x: 0, y: 0 },
      { x: 0, y: 100, type: 'cubic' },
      { x: 100, y: 100, type: 'cubic' },
      { x: 100, y: 0 },
    ]);
  });

  const iterPointsInRectTestData = [
    [{ xMin: -100, yMin: -100, xMax: 200, yMax: 200 }, [0, 1, 2, 3]],
    [{ xMin: 50, yMin: -100, xMax: 200, yMax: 200 }, [2, 3]],
    [{ xMin: -100, yMin: 50, xMax: 200, yMax: 200 }, [1, 2]],
    [{ xMin: 50, yMin: 50, xMax: 200, yMax: 200 }, [2]],
    [{ xMin: 150, yMin: 150, xMax: 200, yMax: 200 }, []],
  ];

  const iterPointsInRectTestPath = new VarPackedPath(
    new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
    [
      VarPackedPath.ON_CURVE,
      VarPackedPath.OFF_CURVE_CUBIC,
      VarPackedPath.OFF_CURVE_CUBIC,
      VarPackedPath.ON_CURVE,
    ],
    [{ endPoint: 3, isClosed: true }]
  );

  const iterPointsInRectTestPoints = Array.from(
    iterPointsInRectTestPath.iterPoints()
  );
  for (const [i, pt] of enumerate(iterPointsInRectTestPoints)) {
    pt.pointIndex = i;
  }

  for (const [rect, expectedIndices] of iterPointsInRectTestData) {
    it('iterPointsInRect', () => {
      const indices = [];
      for (const pt of iterPointsInRectTestPath.iterPointsInRect(rect)) {
        indices.push(pt.pointIndex);
        expect(pt).to.deep.equal(iterPointsInRectTestPoints[pt.pointIndex]);
      }
      expect(indices).to.deep.equal(expectedIndices);
    });
  }

  it('transformed', () => {
    const t = new Transform().scale(2);
    const p = simpleTestPath(false);
    const mp = new MockPath2D();
    p.transformed(t).drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [0, 200], op: 'lineTo' },
      { args: [200, 200], op: 'lineTo' },
      { args: [200, 0], op: 'lineTo' },
    ]);
  });

  it('concat', () => {
    const p1 = simpleTestPath();
    const p2 = p1.copy();
    const p3 = p1.concat(p2);
    expect(p3.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 100 },
          { x: 100, y: 100 },
          { x: 100, y: 0 },
        ],
        isClosed: true,
      },
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 100 },
          { x: 100, y: 100 },
          { x: 100, y: 0 },
        ],
        isClosed: true,
      },
    ]);
  });

  it('getPoint', () => {
    const p = simpleTestPath();
    expect(p.getPoint(-1)).to.deep.equal(undefined);
    expect(p.getPoint(0)).to.deep.equal({ x: 0, y: 0 });
    expect(p.getPoint(3)).to.deep.equal({ x: 100, y: 0 });
    expect(p.getPoint(4)).to.deep.equal(undefined);
  });

  it('getContourIndex', () => {
    const p = new VarPackedPath(
      new VarArray(), // dummy
      [], // dummy
      [
        { endPoint: 3, isClosed: true },
        { endPoint: 13, isClosed: true },
        { endPoint: 15, isClosed: true },
        { endPoint: 20, isClosed: true },
      ]
    );
    expect(p.getContourIndex(-1)).to.equal(undefined);
    expect(p.getContourIndex(0)).to.equal(0);
    expect(p.getContourIndex(3)).to.equal(0);
    expect(p.getContourIndex(4)).to.equal(1);
    expect(p.getContourIndex(5)).to.equal(1);
    expect(p.getContourIndex(13)).to.equal(1);
    expect(p.getContourIndex(14)).to.equal(2);
    expect(p.getContourIndex(15)).to.equal(2);
    expect(p.getContourIndex(16)).to.equal(3);
    expect(p.getContourIndex(20)).to.equal(3);
    expect(p.getContourIndex(21)).to.equal(undefined);
  });

  it('getUnpackedContour', () => {
    const p = simpleTestPath();
    p.pointTypes[0] |= VarPackedPath.SMOOTH_FLAG;
    const u = p.getUnpackedContour(0);
    expect(u.isClosed).to.equal(true);
    const pts = u.points;
    expect(pts.length).to.equal(4);
    expect(pts[0]).to.deep.equal({ x: 0, y: 0, smooth: true });
    expect(pts[3]).to.deep.equal({ x: 100, y: 0 });
    expect(pts[3]).to.deep.equal({ x: 100, y: 0 });
    expect(p.getUnpackedContour(-1).points.length).to.equal(4);
    expect(() => {
      p.getUnpackedContour(1);
    }).to.throw('contourIndex out of bounds: 1');
  });

  it('getControlBounds', () => {
    const p = new VarPackedPath();
    p.moveTo(0, 75);
    p.cubicCurveTo(25, 100, 75, 100, 100, 25);
    p.lineTo(70, 0);
    p.closePath();
    const t = new Transform().scale(1.5, 2);
    const p2 = p.transformed(t);
    expect(p.getControlBounds()).to.deep.equal({
      xMin: 0,
      yMin: 0,
      xMax: 100,
      yMax: 100,
    });
    expect(p2.getControlBounds()).to.deep.equal({
      xMin: 0,
      yMin: 0,
      xMax: 150,
      yMax: 200,
    });
  });

  it('empty getControlBounds', () => {
    const p = new VarPackedPath();
    expect(p.getControlBounds()).to.deep.equal(undefined);
  });

  it('test firstOnCurve bug', () => {
    const p1 = simpleTestPath();
    const p2 = p1.concat(p1);
    p2.pointTypes[0] = VarPackedPath.OFF_CURVE_CUBIC;
    p2.pointTypes[1] = VarPackedPath.OFF_CURVE_CUBIC;
    p2.pointTypes[5] = VarPackedPath.OFF_CURVE_CUBIC;
    p2.pointTypes[6] = VarPackedPath.OFF_CURVE_CUBIC;
    expect(p2.coordinates.length).to.equal(16);
    expect(p2.contourInfo.length).to.equal(2);
    expect(p2.contourInfo[0].endPoint).to.equal(3);
    expect(p2.contourInfo[1].endPoint).to.equal(7);
    const mp = new MockPath2D();
    p2.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { op: 'moveTo', args: [100, 100] },
      { op: 'lineTo', args: [100, 0] },
      { op: 'bezierCurveTo', args: [0, 0, 0, 100, 100, 100] },
      { op: 'closePath', args: [] },
      { op: 'moveTo', args: [0, 0] },
      { op: 'bezierCurveTo', args: [0, 100, 100, 100, 100, 0] },
      { op: 'lineTo', args: [0, 0] },
      { op: 'closePath', args: [] },
    ]);
  });

  it('test setPoint[Position]', () => {
    const p1 = simpleTestPath();
    const mp = new MockPath2D();
    p1.setPointPosition(1, 23, 45);
    p1.setPoint(2, { x: 65, y: 43, type: POINT_TYPE_OFF_CURVE_QUAD });
    p1.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [23, 45], op: 'lineTo' },
      { args: [65, 43, 100, 0], op: 'quadraticCurveTo' },
      { args: [0, 0], op: 'lineTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('test insertPoint 0', () => {
    const p1 = simpleTestPath();
    p1.insertPoint(-1, 0, { x: 12, y: 13 });
    const mp = new MockPath2D();
    p1.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [12, 13], op: 'moveTo' },
      { args: [0, 0], op: 'lineTo' },
      { args: [0, 100], op: 'lineTo' },
      { args: [100, 100], op: 'lineTo' },
      { args: [100, 0], op: 'lineTo' },
      { args: [12, 13], op: 'lineTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('test insertPoint 1', () => {
    const p1 = simpleTestPath();
    p1.insertPoint(-1, 1, { x: 12, y: 13 });
    const mp = new MockPath2D();
    p1.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [12, 13], op: 'lineTo' },
      { args: [0, 100], op: 'lineTo' },
      { args: [100, 100], op: 'lineTo' },
      { args: [100, 0], op: 'lineTo' },
      { args: [0, 0], op: 'lineTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('test appendPoint', () => {
    const p1 = simpleTestPath();
    p1.appendPoint(-1, { x: 12, y: 13 });
    const mp = new MockPath2D();
    p1.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [0, 100], op: 'lineTo' },
      { args: [100, 100], op: 'lineTo' },
      { args: [100, 0], op: 'lineTo' },
      { args: [12, 13], op: 'lineTo' },
      { args: [0, 0], op: 'lineTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('test appendPoint via insertPoint', () => {
    const p1 = simpleTestPath();
    p1.insertPoint(-1, 4, { x: 12, y: 13 });
    const mp = new MockPath2D();
    p1.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [0, 100], op: 'lineTo' },
      { args: [100, 100], op: 'lineTo' },
      { args: [100, 0], op: 'lineTo' },
      { args: [12, 13], op: 'lineTo' },
      { args: [0, 0], op: 'lineTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('test appendPoint with contour index', () => {
    const p1 = simpleTestPath();
    const t = new Transform().translate(10, 10).scale(2);
    const p2 = simpleTestPath().transformed(t);
    const p3 = p1.concat(p2);
    p3.appendPoint(1, { x: 12, y: 13 });
    const mp = new MockPath2D();
    p3.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [0, 100], op: 'lineTo' },
      { args: [100, 100], op: 'lineTo' },
      { args: [100, 0], op: 'lineTo' },
      { args: [0, 0], op: 'lineTo' },
      { args: [], op: 'closePath' },
      { args: [10, 10], op: 'moveTo' },
      { args: [10, 210], op: 'lineTo' },
      { args: [210, 210], op: 'lineTo' },
      { args: [210, 10], op: 'lineTo' },
      { args: [12, 13], op: 'lineTo' },
      { args: [10, 10], op: 'lineTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('test appendPoint index error', () => {
    const p1 = simpleTestPath();
    expect(() => {
      p1.appendPoint(1, { x: 12, y: 13 });
    }).to.throw('contourIndex out of bounds: 1');
  });

  it('test deletePoint', () => {
    const p1 = simpleTestPath();
    p1.setPointType(3, POINT_TYPE_OFF_CURVE_QUAD);
    p1.deletePoint(0, 1);
    const mp = new MockPath2D();
    p1.drawToPath2d(mp);
    expect(mp.items).to.deep.equal([
      { args: [0, 0], op: 'moveTo' },
      { args: [100, 100], op: 'lineTo' },
      { args: [100, 0, 0, 0], op: 'quadraticCurveTo' },
      { args: [], op: 'closePath' },
    ]);
  });

  it('test deletePoint index error', () => {
    const p1 = simpleTestPath();
    expect(() => {
      p1.deletePoint(0, 4);
    }).to.throw('contourPointIndex out of bounds: 4');
    expect(() => {
      p1.deletePoint(0, 5);
    }).to.throw('contourPointIndex out of bounds: 5');
  });

  it('test deleteContour', () => {
    const p = complexTestPath();
    expect(p._checkIntegrity()).to.equal(false);
    let p1;
    p1 = p.copy();

    expect(p1.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 1 },
          { x: 2, y: 3, type: 'quad' },
          { x: 4, y: 5 },
        ],
        isClosed: true,
      },
      {
        points: [
          { x: 6, y: 7 },
          { x: 8, y: 9 },
          { x: 10, y: 11 },
        ],
        isClosed: true,
      },
      {
        points: [
          { x: 12, y: 13 },
          { x: 14, y: 15, type: 'quad' },
          { x: 16, y: 17, type: 'quad' },
          { x: 18, y: 19 },
        ],
        isClosed: true,
      },
    ]);

    p1 = p.copy();
    p1.deleteContour(0);
    expect(p1._checkIntegrity()).to.equal(false);
    expect(p1.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 6, y: 7 },
          { x: 8, y: 9 },
          { x: 10, y: 11 },
        ],
        isClosed: true,
      },
      {
        points: [
          { x: 12, y: 13 },
          { x: 14, y: 15, type: 'quad' },
          { x: 16, y: 17, type: 'quad' },
          { x: 18, y: 19 },
        ],
        isClosed: true,
      },
    ]);

    p1 = p.copy();
    p1.deleteContour(1);
    expect(p1._checkIntegrity()).to.equal(false);

    expect(p1.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 1 },
          { x: 2, y: 3, type: 'quad' },
          { x: 4, y: 5 },
        ],
        isClosed: true,
      },
      {
        points: [
          { x: 12, y: 13 },
          { x: 14, y: 15, type: 'quad' },
          { x: 16, y: 17, type: 'quad' },
          { x: 18, y: 19 },
        ],
        isClosed: true,
      },
    ]);

    p1 = p.copy();
    p1.deleteContour(2);
    expect(p1._checkIntegrity()).to.equal(false);
    expect(p1.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 0, y: 1 },
          { x: 2, y: 3, type: 'quad' },
          { x: 4, y: 5 },
        ],
        isClosed: true,
      },
      {
        points: [
          { x: 6, y: 7 },
          { x: 8, y: 9 },
          { x: 10, y: 11 },
        ],
        isClosed: true,
      },
    ]);

    p1 = p.copy();
    p1.deleteContour(2);
    p1.deleteContour(0);
    expect(p1._checkIntegrity()).to.equal(false);
    expect(p1.unpackedContours()).to.deep.equal([
      {
        points: [
          { x: 6, y: 7 },
          { x: 8, y: 9 },
          { x: 10, y: 11 },
        ],
        isClosed: true,
      },
    ]);

    p1 = p.copy();
    p1.deleteContour(0);
    p1.deleteContour(0);
    p1.deleteContour(0);
    expect(p1._checkIntegrity()).to.equal(false);
    expect(p1.unpackedContours()).to.deep.equal([]);
    expect(p1.numContours).to.equal(0);
  });

  it('test getContour', () => {
    const p = complexTestPath();
    expect(p.getContour(0)).to.deep.equal({
      coordinates: [0, 1, 2, 3, 4, 5],
      pointTypes: [0, 1, 0],
      isClosed: true,
    });
    expect(p.getContour(1)).to.deep.equal({
      coordinates: [6, 7, 8, 9, 10, 11],
      pointTypes: [0, 0, 0],
      isClosed: true,
    });
    expect(p.getContour(2)).to.deep.equal({
      coordinates: [12, 13, 14, 15, 16, 17, 18, 19],
      pointTypes: [0, 1, 1, 0],
      isClosed: true,
    });
  });

  it('test setContour', () => {
    const p = complexTestPath();
    p.setContour(1, p.getContour(0));
    expect(p.getContour(0)).to.deep.equal({
      coordinates: [0, 1, 2, 3, 4, 5],
      pointTypes: [0, 1, 0],
      isClosed: true,
    });
    expect(p.getContour(1)).to.deep.equal({
      coordinates: [0, 1, 2, 3, 4, 5],
      pointTypes: [0, 1, 0],
      isClosed: true,
    });
    expect(p.getContour(2)).to.deep.equal({
      coordinates: [12, 13, 14, 15, 16, 17, 18, 19],
      pointTypes: [0, 1, 1, 0],
      isClosed: true,
    });
    expect(p.numContours).to.equal(3);
    expect(p._checkIntegrity()).to.equal(false);
  });

  it('test insertContour', () => {
    const p = complexTestPath();
    p.insertContour(0, p.getContour(-1));
    expect(p.getContour(0)).to.deep.equal({
      coordinates: [12, 13, 14, 15, 16, 17, 18, 19],
      pointTypes: [0, 1, 1, 0],
      isClosed: true,
    });
    expect(p.getContour(1)).to.deep.equal({
      coordinates: [0, 1, 2, 3, 4, 5],
      pointTypes: [0, 1, 0],
      isClosed: true,
    });
    expect(p.getContour(2)).to.deep.equal({
      coordinates: [6, 7, 8, 9, 10, 11],
      pointTypes: [0, 0, 0],
      isClosed: true,
    });
    expect(p.getContour(3)).to.deep.equal({
      coordinates: [12, 13, 14, 15, 16, 17, 18, 19],
      pointTypes: [0, 1, 1, 0],
      isClosed: true,
    });
    expect(p.numContours).to.equal(4);
    expect(p._checkIntegrity()).to.equal(false);
  });

  it('test insertContour 1', () => {
    const p = complexTestPath();
    p.insertContour(1, p.getContour(-1));
    expect(p.getContour(0)).to.deep.equal({
      coordinates: [0, 1, 2, 3, 4, 5],
      pointTypes: [0, 1, 0],
      isClosed: true,
    });
    expect(p.getContour(1)).to.deep.equal({
      coordinates: [12, 13, 14, 15, 16, 17, 18, 19],
      pointTypes: [0, 1, 1, 0],
      isClosed: true,
    });
    expect(p.getContour(2)).to.deep.equal({
      coordinates: [6, 7, 8, 9, 10, 11],
      pointTypes: [0, 0, 0],
      isClosed: true,
    });
    expect(p.getContour(3)).to.deep.equal({
      coordinates: [12, 13, 14, 15, 16, 17, 18, 19],
      pointTypes: [0, 1, 1, 0],
      isClosed: true,
    });
    expect(p.numContours).to.equal(4);
    expect(p._checkIntegrity()).to.equal(false);
  });

  it('test appendContour', () => {
    const p = complexTestPath();
    p.appendContour(p.getContour(1));
    expect(p.getContour(0)).to.deep.equal({
      coordinates: [0, 1, 2, 3, 4, 5],
      pointTypes: [0, 1, 0],
      isClosed: true,
    });
    expect(p.getContour(1)).to.deep.equal({
      coordinates: [6, 7, 8, 9, 10, 11],
      pointTypes: [0, 0, 0],
      isClosed: true,
    });
    expect(p.getContour(2)).to.deep.equal({
      coordinates: [12, 13, 14, 15, 16, 17, 18, 19],
      pointTypes: [0, 1, 1, 0],
      isClosed: true,
    });
    expect(p.getContour(3)).to.deep.equal({
      coordinates: [6, 7, 8, 9, 10, 11],
      pointTypes: [0, 0, 0],
      isClosed: true,
    });
    expect(p.numContours).to.equal(4);
    expect(p._checkIntegrity()).to.equal(false);
  });

  it('test setUnpackedContour', () => {
    const p = complexTestPath();
    p.pointTypes[2] |= VarPackedPath.SMOOTH_FLAG;
    p.setUnpackedContour(1, p.getUnpackedContour(0));
    expect(p.getContour(0)).to.deep.equal({
      coordinates: [0, 1, 2, 3, 4, 5],
      pointTypes: [0, 1, 8],
      isClosed: true,
    });
    expect(p.getContour(1)).to.deep.equal({
      coordinates: [0, 1, 2, 3, 4, 5],
      pointTypes: [0, 1, 8],
      isClosed: true,
    });
    expect(p.getContour(2)).to.deep.equal({
      coordinates: [12, 13, 14, 15, 16, 17, 18, 19],
      pointTypes: [0, 1, 1, 0],
      isClosed: true,
    });
    expect(p.numContours).to.equal(3);
    expect(p._checkIntegrity()).to.equal(false);
  });

  it('test fromUnpackedContours', () => {
    const p1 = complexTestPath();
    const p2 = VarPackedPath.fromUnpackedContours(p1.unpackedContours());
    expect(p1).to.deep.equal(p2);
    expect(p1.unpackedContours()).to.deep.equal(p2.unpackedContours());
  });

  it('test getContourAndPointIndex', () => {
    const p = complexTestPath();
    expect(p.getContourAndPointIndex(0)).to.deep.equal([0, 0]);
    expect(p.getContourAndPointIndex(1)).to.deep.equal([0, 1]);
    expect(p.getContourAndPointIndex(2)).to.deep.equal([0, 2]);
    expect(p.getContourAndPointIndex(3)).to.deep.equal([1, 0]);
    expect(p.getContourAndPointIndex(4)).to.deep.equal([1, 1]);
    expect(p.getContourAndPointIndex(5)).to.deep.equal([1, 2]);
    expect(p.getContourAndPointIndex(6)).to.deep.equal([2, 0]);
    expect(p.getContourAndPointIndex(7)).to.deep.equal([2, 1]);
    expect(p.getContourAndPointIndex(8)).to.deep.equal([2, 2]);
    expect(p.getContourAndPointIndex(9)).to.deep.equal([2, 3]);
    expect(() => p.getContourAndPointIndex(10)).to.throw(
      'pointIndex out of bounds: 10'
    );
  });

  it('test getNumPointsOfContour', () => {
    const p = complexTestPath();
    p.deletePoint(0, 0);
    expect(p.getNumPointsOfContour(0)).to.equal(2);
    expect(p.getNumPointsOfContour(1)).to.equal(3);
    expect(p.getNumPointsOfContour(2)).to.equal(4);
    expect(() => p.getNumPointsOfContour(3)).to.throw(
      'contourIndex out of bounds: 3'
    );
  });
});
