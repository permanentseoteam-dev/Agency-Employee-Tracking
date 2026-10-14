// Pure input checks for the organization routes (invite.pb.js). No PocketBase
// globals here, so Vitest can test the same file the hooks require().

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const ROLES = ['admin', 'manager', 'employee']
const MIN_PASSWORD = 8
const MAX_PASSWORD = 72

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return 'The temporary password must be at least ' + MIN_PASSWORD + ' characters.'
  }
  if (password.length > MAX_PASSWORD) return 'The temporary password is too long.'
  return null
}

function isDateKey(value) {
  if (!DATE_KEY.test(value)) return false
  const parts = value.split('-').map(Number)
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  return d.getUTCFullYear() === parts[0] && d.getUTCMonth() === parts[1] - 1 && d.getUTCDate() === parts[2]
}

/** "YYYY-MM-DD" for now in a fixed UTC offset (Asia/Karachi = +300 minutes, no DST). */
function todayKey(offsetMinutes, now) {
  const offset = typeof offsetMinutes === 'number' ? offsetMinutes : 300
  const t = typeof now === 'number' ? now : Date.now()
  return new Date(t + offset * 60000).toISOString().slice(0, 10)
}

/**
 * Validates and normalizes the add-employee form.
 * Returns { data } on success or { error } with one message for the admin.
 */
function validateInvite(body) {
  const b = body || {}
  const data = {
    email: str(b.email).toLowerCase(),
    full_name: str(b.full_name),
    password: typeof b.password === 'string' ? b.password : '',
    team: str(b.team),
    role: str(b.role) || 'employee',
    designation: str(b.designation),
    phone: str(b.phone),
    joined_on: str(b.joined_on),
    monthly_salary_pkr: Number(b.monthly_salary_pkr)
  }

  if (!data.full_name) return { error: 'Enter the employee’s full name.' }
  if (data.full_name.length > 100) return { error: 'The name is too long.' }
  if (!EMAIL.test(data.email)) return { error: 'Enter a valid email address.' }
  const pw = passwordProblem(data.password)
  if (pw) return { error: pw }
  if (ROLES.indexOf(data.role) === -1) return { error: 'Pick a valid role.' }
  if (!data.joined_on) data.joined_on = todayKey()
  if (!isDateKey(data.joined_on)) return { error: 'The joining date is not a valid date.' }
  if (b.monthly_salary_pkr === undefined || b.monthly_salary_pkr === null || b.monthly_salary_pkr === '') {
    data.monthly_salary_pkr = 0
  }
  if (!Number.isInteger(data.monthly_salary_pkr) || data.monthly_salary_pkr < 0) {
    return { error: 'The monthly salary must be a whole number of rupees, 0 or more.' }
  }
  return { data: data }
}

/** Validates a deactivate / reactivate request. */
function validateSetActive(body, actingUserId) {
  const b = body || {}
  const userId = str(b.userId)
  if (!userId) return { error: 'Missing employee.' }
  if (typeof b.active !== 'boolean') return { error: 'Missing active flag.' }
  if (!b.active && userId === actingUserId) return { error: 'You cannot deactivate your own account.' }
  let leftOn = ''
  if (!b.active) {
    leftOn = str(b.left_on) || todayKey()
    if (!isDateKey(leftOn)) return { error: 'The leaving date is not a valid date.' }
  }
  return { data: { userId: userId, active: b.active, left_on: leftOn } }
}

/**
 * Throws a 403 unless the request comes from an active app admin.
 * Only called inside PocketBase, where ForbiddenError is a global.
 */
function requireAdmin(e) {
  const auth = e.auth
  if (!auth || auth.collection().name !== 'users' || auth.get('role') !== 'admin' || !auth.getBool('active')) {
    // eslint-disable-next-line no-undef
    throw new ForbiddenError('Only admins can do this.')
  }
  return auth
}

module.exports = {
  ROLES: ROLES,
  requireAdmin: requireAdmin,
  passwordProblem: passwordProblem,
  isDateKey: isDateKey,
  todayKey: todayKey,
  validateInvite: validateInvite,
  validateSetActive: validateSetActive
}
