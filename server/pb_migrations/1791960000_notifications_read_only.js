/// <reference path="../pb_data/types.d.ts" />
// M9: the owner of a notification may only mark it read. The first schema let them
// change any field, so a notification could be handed to someone else with a made-up text.

const OWN_READ_ONLY =
  'user = @request.auth.id && @request.body.user:isset = false && @request.body.type:isset = false && @request.body.payload:isset = false'

migrate(
  (app) => {
    const notifications = app.findCollectionByNameOrId('notifications')
    notifications.updateRule = OWN_READ_ONLY
    app.save(notifications)
  },
  (app) => {
    const notifications = app.findCollectionByNameOrId('notifications')
    notifications.updateRule = 'user = @request.auth.id'
    app.save(notifications)
  }
)
