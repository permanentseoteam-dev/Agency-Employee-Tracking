// GENERATED from server/pb_hooks/lib/stars.js by scripts/build-edge-shared.mjs. Do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// server/pb_hooks/lib/stars.js
var require_stars = __commonJS({
  "server/pb_hooks/lib/stars.js"(exports, module) {
    var DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
    function recordProblem(input, ctx) {
      const c = ctx || {};
      const date = input.date;
      if (typeof date !== "string" || !DATE_KEY.test(date)) return "Pick a valid date.";
      if (c.today && date > c.today) return "Stars can\u2019t be given for a day that hasn\u2019t happened yet.";
      if (c.joined_on && date < c.joined_on) return "That day is before they joined (" + c.joined_on + ").";
      if (c.left_on && date > c.left_on) return "That day is after they left (" + c.left_on + ").";
      if (input.excused && !input.auto) return "Only automatic stars can be excused. Remove a star given by hand instead.";
      if (!input.excused && input.auto) return "This rule\u2019s stars come from attendance automatically. You can excuse them for a day instead.";
      return null;
    }
    function givenPayload(rec, names) {
      return {
        record: rec.id,
        rule_name: names.rule || "",
        stars: Number(rec.stars) || 0,
        date: rec.date,
        note: rec.note || "",
        given_by_name: names.givenBy || ""
      };
    }
    module.exports = { recordProblem, givenPayload };
  }
});
export default require_stars();
