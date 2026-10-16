// GENERATED from shared/logic/segments.js by scripts/build-edge-shared.mjs. Do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/logic/segments.js
var require_segments = __commonJS({
  "shared/logic/segments.js"(exports, module) {
    var MINUTE = 60 * 1e3;
    var MAX_LENGTH_MS = 6 * MINUTE;
    var MAX_AHEAD_MS = 2 * MINUTE;
    var MAX_AGE_MS = 30 * 24 * 60 * MINUTE;
    function parseInstant(value) {
      if (typeof value !== "string" || !value) return NaN;
      return Date.parse(value.trim().replace(" ", "T"));
    }
    function validateSegment(startedAt, endedAt, nowMs) {
      const start = parseInstant(startedAt);
      const end = parseInstant(endedAt);
      if (isNaN(start) || isNaN(end)) return "The segment needs a valid start and end time.";
      if (end <= start) return "The segment must end after it starts.";
      if (end - start > MAX_LENGTH_MS) return "The segment is longer than 6 minutes.";
      if (end > nowMs + MAX_AHEAD_MS) return "The segment ends in the future (check the PC clock).";
      if (nowMs - start > MAX_AGE_MS) return "The segment is more than 30 days old.";
      return null;
    }
    module.exports = { parseInstant, validateSegment, MAX_LENGTH_MS, MAX_AHEAD_MS, MAX_AGE_MS };
  }
});
export default require_segments();
