// GENERATED from shared/logic/leave.js by scripts/build-edge-shared.mjs. Do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/logic/leave.js
var require_leave = __commonJS({
  "shared/logic/leave.js"(exports, module) {
    var DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
    var DAY_MS = 864e5;
    var MAX_RANGE_DAYS = 60;
    var STAFF_ROLES = ["manager", "admin"];
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
    function daysBetween(from, to) {
      const out = [];
      for (let d = from; d <= to && out.length <= MAX_RANGE_DAYS; d = addDays(d, 1)) out.push(d);
      return out;
    }
    function checkDates(start, end, halfDay) {
      if (!isDateKey(start)) return "Pick a valid start date.";
      if (!isDateKey(end)) return "Pick a valid end date.";
      if (end < start) return "The end date must be on or after the start date.";
      if (start.slice(0, 4) !== end.slice(0, 4)) {
        return "Leave can\u2019t run across the new year. Send one request up to 31 Dec and another from 1 Jan.";
      }
      if (daysBetween(start, end).length > MAX_RANGE_DAYS) return "A request can cover at most " + MAX_RANGE_DAYS + " days.";
      if (halfDay && start !== end) return "A half day must start and end on the same day.";
      return null;
    }
    function workingDays(start, end, workDays, holidays) {
      const off = {};
      for (const h of holidays || []) off[typeof h === "string" ? h : h && h.date] = true;
      return daysBetween(start, end).filter((d) => (workDays || []).indexOf(isoWeekday(d)) !== -1 && !off[d]);
    }
    function countDays(start, end, halfDay, workDays, holidays) {
      const n = workingDays(start, end, workDays, holidays).length;
      return halfDay ? n > 0 ? 0.5 : 0 : n;
    }
    function checkEmployment(start, end, user) {
      const u = user || {};
      if (u.joined_on && start < u.joined_on) return "Leave can\u2019t start before your joining date (" + u.joined_on + ").";
      if (u.left_on && end > u.left_on) return "Leave can\u2019t go past your leaving date (" + u.left_on + ").";
      return null;
    }
    function evaluateRequest(input, ctx) {
      const c = ctx || {};
      const halfDay = !!input.half_day;
      const problem = checkDates(input.start_date, input.end_date, halfDay) || checkEmployment(input.start_date, input.end_date, c.user);
      if (problem) return { error: problem };
      const days = countDays(input.start_date, input.end_date, halfDay, c.workDays, c.holidays);
      if (days === 0) {
        return { error: halfDay ? "That day isn\u2019t a working day." : "There are no working days in these dates (only weekends or holidays)." };
      }
      return { days };
    }
    function fmt(n) {
      return String(Math.round(n * 10) / 10);
    }
    function quotaProblem(type, takenDays, newDays) {
      if (!type || !type.paid) return null;
      const quota = Number(type.yearly_quota_days) || 0;
      const left = quota - (Number(takenDays) || 0);
      if (newDays <= left + 1e-9) return null;
      const name = type.name || "this leave type";
      if (left <= 0) return "No " + name + " leave left this year (quota " + fmt(quota) + " days).";
      return "Only " + fmt(left) + " day" + (left === 1 ? "" : "s") + " of " + name + " leave left this year; this request needs " + fmt(newDays) + ".";
    }
    function yearOf(dateKey) {
      return String(dateKey || "").slice(0, 4);
    }
    var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    function leaveByMonth(start, end, halfDay, workDays, holidays) {
      const out = {};
      if (halfDay) {
        if (workingDays(start, start, workDays, holidays).length) out[start.slice(0, 7)] = { full: 0, half: 1 };
        return out;
      }
      for (const d of workingDays(start, end, workDays, holidays)) {
        const month = d.slice(0, 7);
        out[month] = out[month] || { full: 0, half: 0 };
        out[month].full++;
      }
      return out;
    }
    function monthTotals(requests, month, workDays, holidays) {
      const out = { full: 0, half: 0 };
      for (const r of requests || []) {
        const m = leaveByMonth(r.start_date, r.end_date, !!r.half_day, workDays, holidays)[month];
        if (m) {
          out.full += m.full;
          out.half += m.half;
        }
      }
      return out;
    }
    function monthlyLimitProblem(limits, month, taken, adding) {
      const name = MONTH_NAMES[Number(String(month).slice(5, 7)) - 1] || month;
      const check = (limit, used, add, kind, one, many) => {
        const max = Number(limit) || 0;
        if (max <= 0 || !(add > 0) || used + add <= max) return null;
        const left = Math.max(0, max - used);
        const rule = " (limit " + max + " a month)";
        if (left === 0) return "No " + kind + " leave left in " + name + rule + ".";
        return "Only " + left + " " + (left === 1 ? one : many) + " of leave left in " + name + rule + "; this request needs " + add + ".";
      };
      const t = taken || {};
      const a = adding || {};
      return check(limits && limits.full, Number(t.full) || 0, Number(a.full) || 0, "full-day", "full day", "full days") || check(limits && limits.half, Number(t.half) || 0, Number(a.half) || 0, "half-day (short)", "half day", "half days");
    }
    function decisionProblem(actor, requester, before, after) {
      if (actor.id === requester.id) {
        if (before === "pending" && after === "cancelled") return null;
        if (after === "approved" || after === "rejected") return "You can\u2019t decide your own leave request.";
        return "You can only cancel your own request while it is pending.";
      }
      if (STAFF_ROLES.indexOf(actor.role) === -1) return "Only managers and admins can decide leave requests.";
      if (STAFF_ROLES.indexOf(requester.role) !== -1 && actor.role !== "admin") {
        return "A manager\u2019s or admin\u2019s own leave is decided by an admin.";
      }
      if (before === after) return "The request is already " + after + ".";
      if (before === "cancelled") return "A cancelled request can\u2019t be reopened. Ask for a new request instead.";
      if (after === "pending") return "A decided request can\u2019t go back to pending.";
      if (before === "pending") {
        if (after === "approved" || after === "rejected") return null;
        return "Approve or reject the request; only the employee can cancel it while it is pending.";
      }
      if (actor.role !== "admin") return "Only an admin can change a decision that has already been made.";
      if (before === "approved" && (after === "rejected" || after === "cancelled")) return null;
      if (before === "rejected" && after === "approved") return null;
      return "A rejected request can only be approved.";
    }
    var OWNER_EDITABLE = ["status"];
    var STAFF_EDITABLE = ["status", "comment"];
    var CHECKED_FIELDS = ["user", "leave_type", "start_date", "end_date", "half_day", "days", "reason", "status", "comment"];
    function lockedFieldProblem(changed, isOwner) {
      const editable = isOwner ? OWNER_EDITABLE : STAFF_EDITABLE;
      const locked = (changed || []).filter((f) => CHECKED_FIELDS.indexOf(f) !== -1 && editable.indexOf(f) === -1);
      if (!locked.length) return null;
      return isOwner ? "A sent request can\u2019t be edited. Cancel it and send a new one." : "Only the status and comment can change when deciding a request (not: " + locked.join(", ") + ").";
    }
    function isStaffDecision(actorId, requesterId, after) {
      return actorId !== requesterId && (after === "approved" || after === "rejected" || after === "cancelled");
    }
    function attendanceDaysToRecount(before, after, start, end, today) {
      if (before === "approved" === (after === "approved")) return [];
      if (!isDateKey(start) || !isDateKey(end) || !isDateKey(today)) return [];
      const last = end < today ? end : addDays(today, -1);
      return start <= last ? daysBetween(start, last) : [];
    }
    module.exports = {
      MAX_RANGE_DAYS,
      CHECKED_FIELDS,
      isDateKey,
      addDays,
      isoWeekday,
      daysBetween,
      checkDates,
      workingDays,
      countDays,
      checkEmployment,
      evaluateRequest,
      quotaProblem,
      yearOf,
      leaveByMonth,
      monthTotals,
      monthlyLimitProblem,
      decisionProblem,
      lockedFieldProblem,
      isStaffDecision,
      attendanceDaysToRecount
    };
  }
});
export default require_leave();
