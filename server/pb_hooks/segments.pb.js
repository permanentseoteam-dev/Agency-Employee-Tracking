/// <reference path="../pb_data/types.d.ts" />
// Server-side validation of tracked time (plan §4.1). Every create of an
// activity segment goes through here, including the tracker's sync queue.
// Rejections carry data.segment so the client can tell them apart from other
// 400s (it drops a rejected segment instead of retrying it).

onRecordCreateRequest((e) => {
  const segments = require(`${__hooks}/lib/segments.js`)
  const reject = (message) => {
    throw new BadRequestError(message, { segment: { code: 'segment_rejected', message: message } })
  }

  // A retried sync of a segment that is already stored: let the save fail as a
  // duplicate id, which the client counts as synced (not as an overlap).
  const id = e.record.id
  if (id) {
    let exists = false
    try {
      e.app.findRecordById('activity_segments', id)
      exists = true
    } catch (_) {}
    if (exists) return e.next()
  }

  const start = e.record.getString('started_at')
  const end = e.record.getString('ended_at')
  const problem = segments.validateSegment(start, end, Date.now())
  if (problem) reject(problem)

  let overlapping = false
  try {
    e.app.findFirstRecordByFilter(
      'activity_segments',
      'user = {:user} && started_at < {:end} && ended_at > {:start}',
      { user: e.record.getString('user'), start: start, end: end }
    )
    overlapping = true
  } catch (_) {}
  if (overlapping) reject('The segment overlaps time already recorded (is the tracker running on two PCs?).')

  e.next()
}, 'activity_segments')
