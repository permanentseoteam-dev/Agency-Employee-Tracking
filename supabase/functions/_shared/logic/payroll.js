// GENERATED from shared/logic/payroll.js by scripts/build-edge-shared.mjs. Do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/logic/payroll.js
var require_payroll = __commonJS({
  "shared/logic/payroll.js"(exports, module) {
    var MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
    var DAY_MS = 864e5;
    function isMonth(value) {
      return typeof value === "string" && MONTH.test(value);
    }
    function addDays(dateKey, days) {
      return new Date(Date.parse(dateKey + "T00:00:00.000Z") + days * DAY_MS).toISOString().slice(0, 10);
    }
    function isoWeekday(dateKey) {
      const day = (/* @__PURE__ */ new Date(dateKey + "T00:00:00.000Z")).getUTCDay();
      return day === 0 ? 7 : day;
    }
    function monthDays(month) {
      const out = [];
      for (let d = month + "-01"; d.slice(0, 7) === month; d = addDays(d, 1)) out.push(d);
      return out;
    }
    function monthRange(month) {
      const days = monthDays(month);
      return { from: days[0], to: days[days.length - 1] };
    }
    function holidaySet(holidays) {
      const set = {};
      for (const h of holidays || []) set[typeof h === "string" ? h : h.date] = true;
      return set;
    }
    function isWorkingDay(day, workDays, holidays) {
      return (workDays || []).indexOf(isoWeekday(day)) !== -1 && !holidays[day];
    }
    function workingDays(month, workDays, holidays) {
      const set = holidaySet(holidays);
      return monthDays(month).filter((d) => isWorkingDay(d, workDays, set)).length;
    }
    function unpaidLeaveDays(leaves, month, workDays, holidays) {
      const set = holidaySet(holidays);
      const range = monthRange(month);
      let total = 0;
      for (const l of leaves || []) {
        if (l.paid) continue;
        const from = l.start_date > range.from ? l.start_date : range.from;
        const to = l.end_date < range.to ? l.end_date : range.to;
        if (from > to) continue;
        if (l.half_day) {
          if (isWorkingDay(from, workDays, set)) total += 0.5;
          continue;
        }
        for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d, workDays, set)) total += 1;
      }
      return total;
    }
    function attendanceCounts(records) {
      const out = { absent: 0, half: 0 };
      for (const r of records || []) {
        if (r.status === "absent") out.absent++;
        else if (r.status === "half_day") out.half++;
      }
      return out;
    }
    function calculate(input) {
      const base = Number(input.base) || 0;
      const days = Number(input.workingDays) || 0;
      const rate = days > 0 ? base / days : 0;
      const deductedDays = (Number(input.absentDays) || 0) + (Number(input.unpaidLeaveDays) || 0) + 0.5 * (Number(input.halfDays) || 0);
      const deductions = Math.round(deductedDays * rate);
      const adjustment = Math.round(Number(input.adjustment) || 0);
      return { rate, deductions, net: base - deductions + adjustment };
    }
    function employedDuring(month, user) {
      const range = monthRange(month);
      if (!user.active && !user.left_on) return false;
      if (user.joined_on && user.joined_on > range.to) return false;
      if (user.left_on && user.left_on < range.from) return false;
      return true;
    }
    function parseMonth(body, currentMonth) {
      const month = body && typeof body.month === "string" ? body.month.trim() : "";
      if (!isMonth(month)) return { error: "Pick a month." };
      if (month > currentMonth) return { error: "Payroll can be run for the current month or earlier." };
      return { data: { month } };
    }
    var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    function monthLabel(month) {
      return MONTH_NAMES[Number(month.slice(5, 7)) - 1] + " " + month.slice(0, 4);
    }
    module.exports = {
      isMonth,
      monthDays,
      monthRange,
      workingDays,
      unpaidLeaveDays,
      attendanceCounts,
      calculate,
      employedDuring,
      parseMonth,
      monthLabel
    };
  }
});
export default require_payroll();
