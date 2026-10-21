// GENERATED from shared/logic/org.js by scripts/build-edge-shared.mjs. Do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// shared/logic/org.js
var require_org = __commonJS({
  "shared/logic/org.js"(exports, module) {
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
    var ROLES = ["admin", "manager", "employee"];
    var MIN_PASSWORD = 8;
    var MAX_PASSWORD = 72;
    function str(value) {
      return typeof value === "string" ? value.trim() : "";
    }
    function passwordProblem(password, label) {
      const name = label || "temporary password";
      if (typeof password !== "string" || password.length < MIN_PASSWORD) {
        return "The " + name + " must be at least " + MIN_PASSWORD + " characters.";
      }
      if (password.length > MAX_PASSWORD) return "The " + name + " is too long.";
      return null;
    }
    function isDateKey(value) {
      if (!DATE_KEY.test(value)) return false;
      const parts = value.split("-").map(Number);
      const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      return d.getUTCFullYear() === parts[0] && d.getUTCMonth() === parts[1] - 1 && d.getUTCDate() === parts[2];
    }
    function todayKey(offsetMinutes, now) {
      const offset = typeof offsetMinutes === "number" ? offsetMinutes : 300;
      const t = typeof now === "number" ? now : Date.now();
      return new Date(t + offset * 6e4).toISOString().slice(0, 10);
    }
    function validateInvite(body) {
      const b = body || {};
      const data = {
        email: str(b.email).toLowerCase(),
        full_name: str(b.full_name),
        password: typeof b.password === "string" ? b.password : "",
        team: str(b.team),
        role: str(b.role) || "employee",
        designation: str(b.designation),
        phone: str(b.phone),
        joined_on: str(b.joined_on),
        monthly_salary_pkr: Number(b.monthly_salary_pkr)
      };
      if (!data.full_name) return { error: "Enter the employee\u2019s full name." };
      if (data.full_name.length > 100) return { error: "The name is too long." };
      if (!EMAIL.test(data.email)) return { error: "Enter a valid email address." };
      const pw = passwordProblem(data.password);
      if (pw) return { error: pw };
      if (ROLES.indexOf(data.role) === -1) return { error: "Pick a valid role." };
      if (!data.joined_on) data.joined_on = todayKey();
      if (!isDateKey(data.joined_on)) return { error: "The joining date is not a valid date." };
      if (b.monthly_salary_pkr === void 0 || b.monthly_salary_pkr === null || b.monthly_salary_pkr === "") {
        data.monthly_salary_pkr = 0;
      }
      if (!Number.isInteger(data.monthly_salary_pkr) || data.monthly_salary_pkr < 0) {
        return { error: "The monthly salary must be a whole number of rupees, 0 or more." };
      }
      return { data };
    }
    function validateRegister(body) {
      const b = body || {};
      const data = {
        email: str(b.email).toLowerCase(),
        full_name: str(b.full_name),
        password: typeof b.password === "string" ? b.password : "",
        phone: str(b.phone)
      };
      if (!data.full_name) return { error: "Enter your full name." };
      if (data.full_name.length > 100) return { error: "The name is too long." };
      if (!EMAIL.test(data.email)) return { error: "Enter a valid email address." };
      const pw = passwordProblem(data.password, "password");
      if (pw) return { error: pw };
      if (data.phone.length > 30) return { error: "The phone number is too long." };
      return { data };
    }
    function validateApprove(body) {
      const b = body || {};
      const userId = str(b.userId);
      if (!userId) return { error: "Missing employee." };
      const joinedOn = str(b.joined_on) || todayKey();
      if (!isDateKey(joinedOn)) return { error: "The joining date is not a valid date." };
      return { data: { userId, joined_on: joinedOn } };
    }
    function validateSetActive(body, actingUserId) {
      const b = body || {};
      const userId = str(b.userId);
      if (!userId) return { error: "Missing employee." };
      if (typeof b.active !== "boolean") return { error: "Missing active flag." };
      if (!b.active && userId === actingUserId) return { error: "You cannot deactivate your own account." };
      let leftOn = "";
      if (!b.active) {
        leftOn = str(b.left_on) || todayKey();
        if (!isDateKey(leftOn)) return { error: "The leaving date is not a valid date." };
      }
      return { data: { userId, active: b.active, left_on: leftOn } };
    }
    function actionAllowed(role, action) {
      if (role === "admin") return true;
      return role === "manager" && (action === "approve" || action === "reject");
    }
    module.exports = {
      ROLES,
      actionAllowed,
      passwordProblem,
      isDateKey,
      todayKey,
      validateInvite,
      validateRegister,
      validateApprove,
      validateSetActive
    };
  }
});
export default require_org();
