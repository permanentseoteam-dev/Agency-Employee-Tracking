// GENERATED from server/pb_hooks/lib/attendance.js by scripts/build-edge-shared.mjs. Do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// server/pb_hooks/lib/attendance.js
var require_attendance = __commonJS({
  "server/pb_hooks/lib/attendance.js"(exports, module) {
    var DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
    var DAY_MS = 864e5;
    var MAX_RANGE_DAYS = 31;
    var OFFSETS = { "Asia/Karachi": 300, UTC: 0 };
    function offsetFor(timezone) {
      return Object.prototype.hasOwnProperty.call(OFFSETS, timezone) ? OFFSETS[timezone] : 300;
    }
    function isDateKey(value) {
      if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
      const p = value.split("-").map(Number);
      const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
      return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
    }
    function addDays(dateKey, days) {
      return new Date(Date.parse(dateKey + "T00:00:00.000Z") + days * DAY_MS).toISOString().slice(0, 10);
    }
    function isoWeekday(dateKey) {
      const day = (/* @__PURE__ */ new Date(dateKey + "T00:00:00.000Z")).getUTCDay();
      return day === 0 ? 7 : day;
    }
    function dayKeyOf(ms, offsetMinutes) {
      return new Date(ms + offsetMinutes * 6e4).toISOString().slice(0, 10);
    }
    function todayKey(offsetMinutes, nowMs) {
      return dayKeyOf(nowMs, offsetMinutes);
    }
    function parseInstant(value) {
      if (typeof value !== "string" || !value) return NaN;
      return Date.parse(value.trim().replace(" ", "T"));
    }
    function pbDate(ms) {
      return new Date(ms).toISOString().replace("T", " ");
    }
    function dayBounds(day, offsetMinutes) {
      const start = Date.parse(day + "T00:00:00.000Z") - offsetMinutes * 6e4;
      return { start: pbDate(start), end: pbDate(start + DAY_MS) };
    }
    function daysBetween(from, to) {
      const out = [];
      for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
      return out;
    }
    function employedOn(day, user) {
      if (!user.active && !user.left_on) return false;
      if (user.joined_on && day < user.joined_on) return false;
      if (user.left_on && day > user.left_on) return false;
      return true;
    }
    function summarize(segments) {
      let activeMs = 0;
      let idleMs = 0;
      let first = null;
      let last = null;
      for (const s of segments || []) {
        const start = parseInstant(s.started_at);
        const end = parseInstant(s.ended_at);
        if (isNaN(start) || isNaN(end) || end <= start) continue;
        if (s.state === "active") {
          activeMs += end - start;
          if (first === null || start < first) first = start;
          if (last === null || end > last) last = end;
        } else {
          idleMs += end - start;
        }
      }
      return { active_s: Math.round(activeMs / 1e3), idle_s: Math.round(idleMs / 1e3), first, last };
    }
    function statusFor(day, settings, segments, leaves, holidays) {
      const s = settings || {};
      const sum = summarize(segments);
      const isHoliday = (holidays || []).some((h) => (typeof h === "string" ? h : h && h.date) === day);
      const onLeave = (leaves || []).some(
        (l) => (!l.status || l.status === "approved") && l.start_date <= day && l.end_date >= day
      );
      let status;
      if (isHoliday) status = "holiday";
      else if ((s.work_days || []).indexOf(isoWeekday(day)) === -1) status = "weekend";
      else if (onLeave) status = "on_leave";
      else if (sum.active_s === 0) status = "absent";
      else if (sum.active_s < (Number(s.half_day_min_hours) || 0) * 3600) status = "half_day";
      else {
        const hm = String(s.shift_start || "00:00").split(":").map(Number);
        const shiftStart = Date.parse(day + "T00:00:00.000Z") + (hm[0] * 60 + hm[1] - offsetFor(s.timezone)) * 6e4;
        const graceEnd = shiftStart + (Number(s.grace_minutes) || 0) * 6e4;
        status = sum.first > graceEnd ? "late" : "present";
      }
      return {
        date: day,
        status,
        active_s: sum.active_s,
        idle_s: sum.idle_s,
        first_activity_at: sum.first === null ? "" : pbDate(sum.first),
        last_activity_at: sum.last === null ? "" : pbDate(sum.last)
      };
    }
    function parseRange(body, today) {
      const b = body || {};
      const str = (v) => typeof v === "string" ? v.trim() : "";
      const from = str(b.from) || str(b.date);
      const to = str(b.to) || str(b.date);
      if (!isDateKey(from) || !isDateKey(to)) return { error: "Pick a valid date." };
      if (to < from) return { error: "The end date must be on or after the start date." };
      const yesterday = addDays(today, -1);
      if (from > yesterday) return { error: "Attendance is counted for finished days only, up to yesterday." };
      const end = to > yesterday ? yesterday : to;
      const days = daysBetween(from, end);
      if (days.length > MAX_RANGE_DAYS) return { error: "Recompute at most " + MAX_RANGE_DAYS + " days at a time." };
      return { data: { from, to: end, days } };
    }
    function nightlyDays(today, count) {
      const out = [];
      for (let i = 1; i <= count; i++) out.push(addDays(today, -i));
      return out;
    }
    module.exports = {
      offsetFor,
      isDateKey,
      addDays,
      isoWeekday,
      dayKeyOf,
      todayKey,
      dayBounds,
      daysBetween,
      employedOn,
      summarize,
      statusFor,
      parseRange,
      nightlyDays,
      MAX_RANGE_DAYS
    };
  }
});
export default require_attendance();
