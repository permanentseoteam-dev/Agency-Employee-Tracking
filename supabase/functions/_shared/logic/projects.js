// GENERATED from shared/logic/projects.js by scripts/build-edge-shared.mjs. Do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/logic/projects.js
var require_projects = __commonJS({
  "shared/logic/projects.js"(exports, module) {
    var DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
    var DAY_MS = 864e5;
    var MAX_RANGE_DAYS = 62;
    var COUNTED = ["present", "late", "half_day", "absent", "on_leave"];
    function isDateKey(value) {
      return typeof value === "string" && DATE_KEY.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00.000Z"));
    }
    function parseInstant(value) {
      if (typeof value !== "string" || !value) return NaN;
      return Date.parse(value.trim().replace(" ", "T"));
    }
    function localTime(day, hhmm, offsetMinutes) {
      const hm = String(hhmm || "00:00").split(":").map(Number);
      return Date.parse(day + "T00:00:00.000Z") + ((hm[0] || 0) * 60 + (hm[1] || 0) - offsetMinutes) * 6e4;
    }
    function shiftTimes(day, settings, offsetMinutes) {
      const s = settings || {};
      const start = localTime(day, s.shift_start || "09:00", offsetMinutes);
      return {
        shiftStart: start,
        graceEnd: start + (Number(s.grace_minutes) || 0) * 6e4,
        shiftEnd: localTime(day, s.shift_end || "18:00", offsetMinutes)
      };
    }
    function liveStatus(base, times) {
      const status = base && base.status;
      if (status === "holiday" || status === "weekend" || status === "on_leave") return status;
      if (!base.active_s) return times.now >= times.shiftEnd ? "absent" : "not_in_yet";
      if (status === "half_day" && times.now < times.shiftEnd) {
        return parseInstant(base.first_activity_at) > times.graceEnd ? "late" : "present";
      }
      return status;
    }
    function monthCounts(records) {
      const out = {};
      for (const s of COUNTED) out[s] = 0;
      for (const r of records || []) if (Object.prototype.hasOwnProperty.call(out, r.status)) out[r.status]++;
      return out;
    }
    function canSee(client, auth) {
      if (!auth || !auth.id) return false;
      if (auth.role === "admin") return true;
      return !client.archived && (client.members || []).indexOf(auth.id) !== -1;
    }
    function clientOf(query) {
      const raw = query && query.client;
      const client = typeof raw === "string" ? raw.trim() : "";
      return client;
    }
    function parseStatusQuery(query, today) {
      const client = clientOf(query);
      if (!client) return { error: "Pick a client." };
      const raw = query && typeof query.date === "string" ? query.date.trim() : "";
      const date = raw || today;
      if (!isDateKey(date)) return { error: "Pick a valid date." };
      if (date > today) return { error: "Pick today or an earlier day." };
      return { data: { client, date } };
    }
    function parseLeaveQuery(query) {
      const client = clientOf(query);
      if (!client) return { error: "Pick a client." };
      const from = query && typeof query.from === "string" ? query.from.trim() : "";
      const to = query && typeof query.to === "string" ? query.to.trim() : "";
      if (!isDateKey(from) || !isDateKey(to)) return { error: "Pick valid dates." };
      if (to < from) return { error: "The end date is before the start date." };
      const days = (Date.parse(to + "T00:00:00.000Z") - Date.parse(from + "T00:00:00.000Z")) / DAY_MS + 1;
      if (days > MAX_RANGE_DAYS) return { error: "Pick at most " + MAX_RANGE_DAYS + " days." };
      return { data: { client, from, to } };
    }
    function eventTimesProblem(startsAt, endsAt) {
      const start = parseInstant(startsAt);
      const end = parseInstant(endsAt);
      if (Number.isNaN(start) || Number.isNaN(end)) return "Pick a start and an end.";
      if (end <= start) return "An event has to end after it starts.";
      return null;
    }
    module.exports = {
      COUNTED,
      MAX_RANGE_DAYS,
      shiftTimes,
      liveStatus,
      monthCounts,
      canSee,
      parseStatusQuery,
      parseLeaveQuery,
      eventTimesProblem
    };
  }
});
export default require_projects();
