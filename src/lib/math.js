const checkValidRanges = (arrays) =>
  arrays.reduce(
    (result, a) => (a.length !== 2 || a[0] === a[1] ? false : result),
    true
  );

const remap = (
  value,
  inputRange,
  targetRange,
  clamp = false,
  shouldRound = false
) => {
  if (!checkValidRanges([inputRange, targetRange])) {
    throw Error(
      "inputRange and targetRange must be number arrays with exactly 2 elements, and these must differ; you gave:" +
        JSON.stringify({ inputRange, targetRange })
    );
  }
  // let outgoing = (value - start1) / (stop1 - start1) * (stop2 - start2) + start2;
  let outgoing =
    ((value - inputRange[0]) / (inputRange[1] - inputRange[0])) *
      (targetRange[1] - targetRange[0]) +
    targetRange[0];
  if (clamp === true) {
    if (targetRange[0] < targetRange[1]) {
      // normal output range
      if (outgoing > targetRange[1]) {
        outgoing = targetRange[1];
      } else if (outgoing < targetRange[0]) {
        outgoing = targetRange[0];
      }
    } else {
      // inverse output range
      if (outgoing < targetRange[1]) {
        outgoing = targetRange[1];
      } else if (outgoing > targetRange[0]) {
        outgoing = targetRange[0];
      }
    }
  }
  return shouldRound ? Math.round(outgoing) : outgoing;
};

const remapArray = (
  values,
  inputRange,
  targetRange,
  clamp = false,
  shouldRound = false
) =>
  values.reduce(
    (result, v) => [
      ...result,
      remap(v, inputRange, targetRange, clamp, shouldRound),
    ],
    []
  );

const remapCoords = (
  inputCoords,
  inputDimensions,
  targetDimensions,
  clamp = false,
  shouldRound = false
) => {
  if (
    inputCoords.length !== targetDimensions.length ||
    inputCoords.length !== inputDimensions.length
  ) {
    throw Error(
      "coordinates must have same number of dimensions as input and target dimensions"
    );
  }
  return inputCoords.map((x, index) =>
    remap(
      x,
      [0, inputDimensions[index]],
      [0, targetDimensions[index]],
      clamp,
      shouldRound
    )
  );
};

export function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));
}

export function map(
  value,
  oldMin = -1,
  oldMax = 1,
  newMin = 0,
  newMax = 1,
  isClamp
) {
  const newValue =
    ((value - oldMin) * (newMax - newMin)) / (oldMax - oldMin) + newMin;
  if (isClamp)
    return clamp(newValue, Math.min(newMin, newMax), Math.max(newMin, newMax));
  return newValue;
}

// export function lerp(target, value, alpha, calcHz = true) {
//   //let hz = mainThread && calcHz ? Render.HZ_MULTIPLIER : 1;
//   //   return value + (target - value) * Math.clamp(alpha * hz, 0, 1);
//   return value + (target - value) * clamp(alpha, 0, 1);
// }

export function _lerp(source, target, alpha) {
  return source + (target - source) * clamp(alpha, 0, 1);
}

export function lerp(source, target, rate, frameDelta, targetFps = 60) {
  // return normal lerp if no delta was passed
  if (typeof frameDelta === "undefined") {
    return _lerp(source, target, rate);
  }

  const relativeDelta = frameDelta / (1 / targetFps);
  const smoothing = 1 - rate;
  return _lerp(source, target, 1 - Math.pow(smoothing, relativeDelta));
}

export function damp(x, y, t, delta) {
  return lerp(x, y, 1 - Math.exp(Math.log(1 - t) * (16.6666 / delta)));
}

export function dampSingle(x, y, t, d) {
  return lerp(x, y, 1 - Math.exp(Math.log(1 - t) * d));
}

export function parabola(x, k) {
  return Math.pow(4.0 * x * (1.0 - x), k);
}

export function randomInRange(min, max, precision = 0) {
  if (typeof min === "undefined") return Math.random();
  if (min === max) return min;

  min = min || 0;
  max = max || 1;

  if (precision == 0) return Math.floor(Math.random() * (max + 1 - min) + min);
  return Math.round(min + Math.random() * (max - min), precision);
}

export function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians) {
  return (radians * 180) / Math.PI;
}
