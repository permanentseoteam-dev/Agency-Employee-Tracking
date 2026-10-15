/// <reference path="../pb_data/types.d.ts" />
// Projects (the Project tab): clients, the people on each, and a calendar per client.
// - clients: the admin creates them and picks their people (members). A member sees the
//   clients they're on; archived clients are hidden from everyone but admins.
// - project_events: a client's calendar (meetings, deadlines). Everyone on the client can
//   add, change and delete them, whatever their role; admins can for every client.
// Teammates' attendance comes from GET /api/projects/status (projects.pb.js), because the
// attendance records themselves stay readable only by the person, their manager and admins.

const ADMIN = '@request.auth.role = "admin"'
const MEMBER = '(archived = false && members.id ?= @request.auth.id)'
const EVENT_MEMBER = '(client.archived = false && client.members.id ?= @request.auth.id)'
const EVENT_ACCESS = `${ADMIN} || ${EVENT_MEMBER}`

const timestamps = () => [
  { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
  { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
]

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const clients = new Collection({
      type: 'base',
      name: 'clients',
      listRule: `${ADMIN} || ${MEMBER}`,
      viewRule: `${ADMIN} || ${MEMBER}`,
      createRule: ADMIN,
      updateRule: ADMIN,
      deleteRule: ADMIN,
      fields: [
        { type: 'text', name: 'name', required: true, max: 100, presentable: true },
        { type: 'text', name: 'description', max: 300 },
        { type: 'bool', name: 'archived' },
        { type: 'relation', name: 'members', collectionId: users.id, maxSelect: 999 },
        ...timestamps()
      ],
      indexes: ['CREATE UNIQUE INDEX idx_clients_name ON clients (name COLLATE NOCASE)']
    })
    app.save(clients)

    app.save(
      new Collection({
        type: 'base',
        name: 'project_events',
        listRule: EVENT_ACCESS,
        viewRule: EVENT_ACCESS,
        createRule: EVENT_ACCESS,
        // An event stays with its client: moving it would hand it to people who may not be on both.
        updateRule: `(${EVENT_ACCESS}) && (@request.body.client:isset = false || @request.body.client = client)`,
        deleteRule: EVENT_ACCESS,
        fields: [
          { type: 'relation', name: 'client', required: true, collectionId: clients.id, maxSelect: 1, cascadeDelete: true },
          { type: 'text', name: 'title', required: true, max: 200, presentable: true },
          { type: 'date', name: 'starts_at', required: true },
          { type: 'date', name: 'ends_at', required: true },
          { type: 'text', name: 'description', max: 2000 },
          { type: 'relation', name: 'created_by', collectionId: users.id, maxSelect: 1 }, // set by projects.pb.js
          ...timestamps()
        ],
        indexes: ['CREATE INDEX idx_project_events_client_start ON project_events (client, starts_at)']
      })
    )
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('project_events'))
    app.delete(app.findCollectionByNameOrId('clients'))
  }
)
