import { ChangeCollector, applyChange, consolidateChanges } from './changes.js';
import { range, reversed } from './utils.js';

export function recordChanges(subject, func) {
  const changes = new ChangeCollector();
  try {
    func(getProxy(subject, changes));
  } catch (error) {
    applyChange(subject, changes.rollbackChange);
    throw error;
  }
  return changes;
}

function getArrayProxyMethods(subject, changes) {
  return {
    push(...items) {
      changes.addChange('+', subject.length, ...items);
      changes.addRollbackChange('-', subject.length, items.length);
      subject.push(...items);
    },
    splice(index, deleteCount, ...items) {
      changes.addChange(':', index, deleteCount, ...items);
      changes.addRollbackChange(
        ':',
        index,
        items.length,
        ...subject.slice(index, index + deleteCount)
      );
      subject.splice(index, deleteCount, ...items);
    },
  };
}

function getVarPackedPathProxyMethods(subject, changes) {
  return {
    insertContour(index, contour) {
      changes.addChange('insertContour', index, contour);
      changes.addRollbackChange('deleteContour', index);
      subject.insertContour(index, contour);
    },
    deleteContour(index) {
      changes.addChange('deleteContour', index);
      changes.addRollbackChange(
        'insertContour',
        index,
        subject.getContour(index)
      );
      subject.deleteContour(index);
    },
    insertPoint(contourIndex, contourPointIndex, point) {
      changes.addChange('insertPoint', contourIndex, contourPointIndex, point);
      changes.addRollbackChange('deletePoint', contourIndex, contourPointIndex);
      subject.insertPoint(contourIndex, contourPointIndex, point);
    },
    deletePoint(contourIndex, contourPointIndex) {
      changes.addChange('deletePoint', contourIndex, contourPointIndex);
      changes.addRollbackChange(
        'insertPoint',
        contourIndex,
        contourPointIndex,
        subject.getContourPoint(contourIndex, contourPointIndex)
      );
      subject.deletePoint(contourIndex, contourPointIndex);
    },
    setPointPosition(pointIndex, x, y) {
      changes.addChange('=xy', pointIndex, x, y);
      changes.addRollbackChange(
        '=xy',
        pointIndex,
        ...subject.getPointPosition(pointIndex)
      );
      subject.setPointPosition(pointIndex, x, y);
    },
  };
}

export const proxyMethodsMap = {
  Array: getArrayProxyMethods,
  VarPackedPath: getVarPackedPathProxyMethods, // Poss. need to change the key to VarPackedPath.name when minifying
};

function getProxy(subject, changes) {
  if (!needsProxy(subject)) {
    throw new Error(`subject must be an object`);
  }

  const getMethods = proxyMethodsMap[subject.constructor.name];
  const methods = getMethods !== undefined ? getMethods(subject, changes) : {};
  const isArray = Array.isArray(subject);

  const handler = {
    set(subject, prop, value) {
      if (isArray && !isNaN(prop)) {
        prop = parseInt(prop);
      }
      changes.addChange('=', prop, value);
      if (!isArray && subject[prop] === undefined) {
        changes.addRollbackChange('d', prop);
      } else {
        changes.addRollbackChange('=', prop, subject[prop]);
      }
      subject[prop] = value;
      return true;
    },

    get(subject, prop) {
      const method = methods[prop];
      if (method) {
        return method;
      }
      if (isArray && !isNaN(prop)) {
        prop = parseInt(prop);
      }
      subject = subject[prop];
      return needsProxy(subject)
        ? getProxy(subject, changes.subCollector(prop))
        : subject;
    },

    deleteProperty(subject, prop) {
      if (isArray) {
        throw new Error("can't delete array item");
      } else {
        if (subject[prop] === undefined) {
          throw new Error("can't delete undefined property");
        }
        changes.addChange('d', prop);
        changes.addRollbackChange('=', prop, subject[prop]);
        delete subject[prop];
      }
      return true;
    },
  };

  return new Proxy(subject, handler);
}

function needsProxy(subject) {
  return subject !== null && typeof subject === 'object';
}
