/// <reference path="../pb_data/types.d.ts" />
// Calendar events (plan §4.6): admins write them through the API rules; this only
// makes sure an event ends after it starts, whatever client sends it. Each handler
// runs in its own isolated context, so the check is repeated rather than shared.

onRecordCreateRequest((e) => {
  const start = Date.parse(e.record.getString('starts_at').replace(' ', 'T'))
  const end = Date.parse(e.record.getString('ends_at').replace(' ', 'T'))
  if (!(end > start)) throw new BadRequestError('The event must end after it starts.')
  e.next()
}, 'events')

onRecordUpdateRequest((e) => {
  const start = Date.parse(e.record.getString('starts_at').replace(' ', 'T'))
  const end = Date.parse(e.record.getString('ends_at').replace(' ', 'T'))
  if (!(end > start)) throw new BadRequestError('The event must end after it starts.')
  e.next()
}, 'events')
