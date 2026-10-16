// GENERATED from shared/logic/notifications.js by scripts/build-edge-shared.mjs. Do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/logic/notifications.js
var require_notifications = __commonJS({
  "shared/logic/notifications.js"(exports, module) {
    var DECISIONS = ["approved", "rejected"];
    function unique(ids) {
      const out = [];
      for (const id of ids) if (id && out.indexOf(id) === -1) out.push(id);
      return out;
    }
    function requestRecipients(requester, teamManagerId, adminIds) {
      const toAdmins = requester.role === "manager" || requester.role === "admin" || !teamManagerId || teamManagerId === requester.id;
      return unique((toAdmins ? adminIds || [] : [teamManagerId]).filter((id) => id !== requester.id));
    }
    function isNewRequest(status) {
      return !status || status === "pending";
    }
    function isDecision(before, after) {
      return DECISIONS.indexOf(after) !== -1 && before !== after;
    }
    function requestPayload(req, names) {
      return {
        request: req.id,
        requester: req.user,
        requester_name: names.requester || "",
        leave_type_name: names.leaveType || "",
        start_date: req.start_date,
        end_date: req.end_date,
        half_day: !!req.half_day,
        days: req.days
      };
    }
    function decisionPayload(req, names) {
      const p = requestPayload(req, names);
      p.status = req.status;
      p.decided_by_name = names.approver || "";
      p.comment = req.comment || "";
      return p;
    }
    module.exports = { requestRecipients, isNewRequest, isDecision, requestPayload, decisionPayload };
  }
});
export default require_notifications();
