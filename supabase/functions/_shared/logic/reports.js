// GENERATED from server/pb_hooks/lib/reports.js by scripts/build-edge-shared.mjs. Do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// server/pb_hooks/lib/reports.js
var require_reports = __commonJS({
  "server/pb_hooks/lib/reports.js"(exports, module) {
    var DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
    var GROUPS = ["day", "week", "month"];
    var MAX_DAYS = 366;
    var OFFSETS = { "Asia/Karachi": 300, UTC: 0 };
    function offsetFor(timezone) {
      return Object.prototype.hasOwnProperty.call(OFFSETS, timezone) ? OFFSETS[timezone] : 300;
    }
    function isDateKey(value) {
      if (!DATE_KEY.test(value)) return false;
      const p = value.split("-").map(Number);
      const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
      return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
    }
    function str(v) {
      return typeof v === "string" ? v.trim() : "";
    }
    function pbDate(ms) {
      return new Date(ms).toISOString().replace("T", " ");
    }
    function parseQuery(query, timezone) {
      const q = query || {};
      const from = str(q.from);
      const to = str(q.to);
      const group = str(q.group) || "day";
      if (!isDateKey(from) || !isDateKey(to)) return { error: "Pick a valid date range." };
      if (to < from) return { error: "The end date must be on or after the start date." };
      if (GROUPS.indexOf(group) === -1) return { error: "Group by day, week or month." };
      const offset = offsetFor(timezone);
      const fromMs = Date.parse(from + "T00:00:00.000Z") - offset * 6e4;
      const toMs = Date.parse(to + "T00:00:00.000Z") + 864e5 - offset * 6e4;
      if ((toMs - fromMs) / 864e5 > MAX_DAYS) return { error: "Pick a range of at most one year." };
      return {
        data: {
          from,
          to,
          group,
          team: str(q.team),
          user: str(q.user),
          offset,
          start: pbDate(fromMs),
          end: pbDate(toMs)
        }
      };
    }
    function periodSql(group, offsetMinutes) {
      const local = "datetime(s.started_at, '" + (offsetMinutes >= 0 ? "+" : "") + offsetMinutes + " minutes')";
      if (group === "month") return "strftime('%Y-%m', " + local + ")";
      if (group === "week") return "date(" + local + ", '-6 days', 'weekday 1')";
      return "date(" + local + ")";
    }
    function buildSql(group, offsetMinutes, scope, hasTeam, hasUser) {
      const period = periodSql(group, offsetMinutes);
      const where = ["s.started_at >= {:start}", "s.started_at < {:end}"];
      if (scope === "managed") where.push("t.manager = {:caller}");
      if (hasTeam) where.push("u.team = {:team}");
      if (hasUser) where.push("s.user = {:user}");
      return "SELECT s.user AS user, u.full_name AS full_name, COALESCE(t.name, '') AS team, " + period + " AS period, CAST(ROUND(SUM(CASE WHEN s.state = 'active' THEN (julianday(s.ended_at) - julianday(s.started_at)) * 86400 ELSE 0 END)) AS INTEGER) AS active_s, CAST(ROUND(SUM(CASE WHEN s.state = 'idle' THEN (julianday(s.ended_at) - julianday(s.started_at)) * 86400 ELSE 0 END)) AS INTEGER) AS idle_s FROM activity_segments s JOIN users u ON u.id = s.user LEFT JOIN teams t ON t.id = u.team WHERE " + where.join(" AND ") + " GROUP BY s.user, period ORDER BY u.full_name, s.user, period";
    }
    module.exports = { parseQuery, periodSql, buildSql, offsetFor, pbDate };
  }
});
export default require_reports();
