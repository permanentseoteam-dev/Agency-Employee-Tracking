/// <reference path="../pb_data/types.d.ts" />
// Stars (replacing the late penalty). The API rules let everyone read the star rules and
// let only admins change them or give stars; these hooks keep the content honest.
// Each handler runs in its own isolated context: helpers come from require().

// ---- star_rules: the automatic ones come from the migration and stay ----

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth() && e.record.getString('auto')) {
    throw new BadRequestError('New rules are given by hand. The automatic ones already exist.')
  }
  e.next()
}, 'star_rules')

onRecordUpdateRequest((e) => {
  if (e.record.getString('auto') !== e.record.original().getString('auto')) {
    throw new BadRequestError('Whether a rule is automatic can’t change.')
  }
  e.next()
}, 'star_rules')

onRecordDeleteRequest((e) => {
  if (e.record.getString('auto')) throw new BadRequestError('An automatic rule can’t be deleted. Set its stars to 0 to stop it.')
  e.next()
}, 'star_rules')

// ---- star_records: stars given by hand, and excuses for automatic ones ----

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib/stars.js`)
  const att = require(`${__hooks}/lib/attendance.js`)
  const store = require(`${__hooks}/lib/attendance_store.js`)
  const rec = e.record

  let rule = null
  try {
    rule = e.app.findRecordById('star_rules', rec.getString('rule'))
  } catch (_) {}
  if (!rule) throw new BadRequestError('Pick a rule.')
  let person = null
  try {
    person = e.app.findRecordById('users', rec.getString('user'))
  } catch (_) {}
  if (!person) throw new BadRequestError('Pick a person.')

  const today = att.todayKey(att.offsetFor(store.loadSettings(e.app).timezone), Date.now())
  const problem = lib.recordProblem(
    { date: rec.getString('date'), excused: rec.getBool('excused'), auto: rule.getString('auto') },
    { today: today, joined_on: person.getString('joined_on'), left_on: person.getString('left_on') }
  )
  if (problem) throw new BadRequestError(problem)

  let same = null
  try {
    same = e.app.findFirstRecordByFilter('star_records', 'user = {:user} && rule = {:rule} && date = {:date}', {
      user: person.id,
      rule: rule.id,
      date: rec.getString('date')
    })
  } catch (_) {}
  if (same) {
    throw new BadRequestError(same.getBool('excused') ? 'That day is already excused for this rule.' : 'They already have stars for this rule on that day.')
  }

  if (!e.hasSuperuserAuth()) rec.set('given_by', e.auth.id)
  e.next()
}, 'star_records')

// Stars given by hand → the person hears about it. A failure is logged, the stars stay.
onRecordAfterCreateSuccess((e) => {
  if (e.record.getBool('excused')) return e.next()
  try {
    const lib = require(`${__hooks}/lib/stars.js`)
    const rec = e.record
    const rule = e.app.findRecordById('star_rules', rec.getString('rule'))
    let givenBy = ''
    try {
      givenBy = e.app.findRecordById('users', rec.getString('given_by')).getString('full_name')
    } catch (_) {}
    const n = new Record(e.app.findCollectionByNameOrId('notifications'))
    n.set('user', rec.getString('user'))
    n.set('type', 'stars_given')
    n.set(
      'payload',
      lib.givenPayload(
        { id: rec.id, stars: rule.getInt('stars'), date: rec.getString('date'), note: rec.getString('note') },
        { rule: rule.getString('name'), givenBy: givenBy }
      )
    )
    e.app.save(n)
  } catch (err) {
    e.app.logger().error('stars: notifying the person', 'error', String(err))
  }
  e.next()
}, 'star_records')
