// GENERATED from shared/logic/attendance.js by scripts/build-edge-shared.mjs. Do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/logic/attendance.js
var require_attendance = __commonJS({
  "shared/logic/attendance.js"(exports, module) {
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
    function mergedMs(intervals) {
      const sorted = (intervals || []).slice().sort((a, b) => a[0] - b[0]);
      let total = 0;
      let start = null;
      let end = null;
      for (const iv of sorted) {
        if (end === null || iv[0] > end) {
          if (end !== null) total += end - start;
          start = iv[0];
          end = iv[1];
        } else if (iv[1] > end) {
          end = iv[1];
        }
      }
      if (end !== null) total += end - start;
      return total;
    }
    function summarize(segments) {
      const active = [];
      const idle = [];
      let first = null;
      let last = null;
      for (const s of segments || []) {
        const start = parseInstant(s.started_at);
        const end = parseInstant(s.ended_at);
        if (isNaN(start) || isNaN(end) || end <= start) continue;
        if (s.state === "active") {
          active.push([start, end]);
          if (first === null || start < first) first = start;
          if (last === null || end > last) last = end;
        } else {
          idle.push([start, end]);
        }
      }
      return { active_s: Math.round(mergedMs(active) / 1e3), idle_s: Math.round(mergedMs(idle) / 1e3), first, last };
    }
    function starSettings(settings) {
      const s = settings || {};
      const target = Number(s.required_daily_minutes);
      const block = Number(s.star_block_minutes);
      return { targetMinutes: target > 0 ? target : 360, blockMinutes: block > 0 ? block : 30 };
    }
    function starBlocks(ms, blockMinutes) {
      return ms > 0 ? Math.ceil(ms / (blockMinutes * 6e4)) : 0;
    }
    function paidLeavePart(day, leaves) {
      let halves = 0;
      let paid = 0;
      for (const l of leaves || []) {
        if (l.status && l.status !== "approved") continue;
        if (!(l.start_date <= day && l.end_date >= day)) continue;
        if (!l.half_day) return l.paid === false ? 0 : 1;
        if (halves < 2) {
          halves++;
          if (l.paid !== false) paid += 0.5;
        }
      }
      return paid;
    }
    function leaveCover(day, leaves) {
      let halves = 0;
      for (const l of leaves || []) {
        if (l.status && l.status !== "approved") continue;
        if (!(l.start_date <= day && l.end_date >= day)) continue;
        if (!l.half_day) return "full";
        halves++;
      }
      if (halves >= 2) return "full";
      return halves === 1 ? "half" : "";
    }
    function statusFor(day, settings, segments, leaves, holidays) {
      const s = settings || {};
      const sum = summarize(segments);
      const stars = starSettings(s);
      const isHoliday = (holidays || []).some((h) => (typeof h === "string" ? h : h && h.date) === day);
      const cover = leaveCover(day, leaves);
      let status;
      let paid = 1;
      let lateMs = 0;
      let shortMs = 0;
      if (isHoliday) {
        status = "holiday";
        paid = -1;
      } else if ((s.work_days || []).indexOf(isoWeekday(day)) === -1) {
        status = "weekend";
        paid = -1;
      } else if (cover === "full") {
        status = "on_leave";
        paid = paidLeavePart(day, leaves);
      } else if (cover === "half") {
        status = sum.active_s > 0 ? "present" : "on_leave";
        paid = 0.5 + paidLeavePart(day, leaves);
        shortMs = Math.max(0, (stars.targetMinutes * 60 / 2 - sum.active_s) * 1e3);
      } else if (sum.active_s === 0) {
        status = "absent";
        paid = 0;
      } else {
        const hm = String(s.shift_start || "00:00").split(":").map(Number);
        const shiftStart = Date.parse(day + "T00:00:00.000Z") + (hm[0] * 60 + hm[1] - offsetFor(s.timezone)) * 6e4;
        const graceEnd = shiftStart + (Number(s.grace_minutes) || 0) * 6e4;
        lateMs = Math.max(0, sum.first - graceEnd);
        shortMs = Math.max(0, (stars.targetMinutes * 60 - sum.active_s) * 1e3);
        status = lateMs > 0 ? "late" : "present";
      }
      return {
        date: day,
        status,
        active_s: sum.active_s,
        idle_s: sum.idle_s,
        first_activity_at: sum.first === null ? "" : pbDate(sum.first),
        last_activity_at: sum.last === null ? "" : pbDate(sum.last),
        late_minutes: Math.ceil(lateMs / 6e4),
        late_stars: starBlocks(lateMs, stars.blockMinutes),
        shortfall_minutes: Math.ceil(shortMs / 6e4),
        shortfall_stars: starBlocks(shortMs, stars.blockMinutes),
        pay_basis: paid < 0 ? "off" : paid >= 1 ? "full" : paid >= 0.5 ? "half" : "none"
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
      mergedMs,
      summarize,
      starSettings,
      leaveCover,
      paidLeavePart,
      statusFor,
      parseRange,
      nightlyDays,
      MAX_RANGE_DAYS
    };
  }
});
export default require_attendance();
