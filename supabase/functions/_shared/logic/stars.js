// GENERATED from shared/logic/stars.js by scripts/build-edge-shared.mjs. Do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/logic/stars.js
var require_stars = __commonJS({
  "shared/logic/stars.js"(exports, module) {
    var DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
    function recordProblem(input, ctx) {
      const c = ctx || {};
      const date = input.date;
      if (typeof date !== "string" || !DATE_KEY.test(date)) return "Pick a valid date.";
      if (c.today && date > c.today) return "Stars can\u2019t be given for a day that hasn\u2019t happened yet.";
      if (c.joined_on && date < c.joined_on) return "That day is before they joined (" + c.joined_on + ").";
      if (c.left_on && date > c.left_on) return "That day is after they left (" + c.left_on + ").";
      if (c.locked) return "That month\u2019s payroll is approved, so its stars can\u2019t change.";
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
    function monthStars(attendance, rules, records) {
      const byId = {};
      const byStatus = {};
      for (const r of rules || []) {
        byId[r.id] = r;
        if (r.auto) byStatus[r.auto] = r;
      }
      const excused = {};
      for (const r of records || []) if (r.excused) excused[r.user + "|" + r.rule + "|" + r.date] = true;
      const out = {};
      const add = (user, rule) => {
        out[user] = (out[user] || 0) + (Number(rule.stars) || 0);
      };
      for (const a of attendance || []) {
        const rule = byStatus[a.status];
        if (rule && !excused[a.user + "|" + rule.id + "|" + a.date]) add(a.user, rule);
      }
      for (const r of records || []) {
        const rule = byId[r.rule];
        if (rule && !r.excused) add(r.user, rule);
      }
      return out;
    }
    function recordsByDay(rules, records) {
      const byId = {};
      for (const r of rules || []) byId[r.id] = r;
      const out = {};
      for (const rec of records || []) {
        const rule = byId[rec.rule];
        if (!rule) continue;
        const d = out[rec.date] = out[rec.date] || { hand: 0, late: false, short: false };
        if (rec.excused) {
          if (rule.auto === "late") d.late = true;
          else if (rule.auto === "short") d.short = true;
        } else if (!rule.auto) {
          d.hand += Number(rule.stars) || 0;
        }
      }
      return out;
    }
    module.exports = { recordProblem, givenPayload, monthStars, recordsByDay };
  }
});
export default require_stars();
