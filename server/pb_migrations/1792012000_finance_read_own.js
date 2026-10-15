/// <reference path="../pb_data/types.d.ts" />
// Finance for every role: managers and employees read their own salary and their own
// line in each finalized payroll month. Drafts stay with the admins, who alone can
// change anything (create, update and delete rules are untouched).

const ADMIN = '@request.auth.role = "admin"'
const READ = {
  salaries: `${ADMIN} || user = @request.auth.id`,
  payroll_runs: `${ADMIN} || (@request.auth.id != "" && status = "finalized")`,
  payroll_items: `${ADMIN} || (user = @request.auth.id && run.status = "finalized")`
}

migrate(
  (app) => {
    for (const name of Object.keys(READ)) {
      const collection = app.findCollectionByNameOrId(name)
      collection.listRule = READ[name]
      collection.viewRule = READ[name]
      app.save(collection)
    }
  },
  (app) => {
    for (const name of Object.keys(READ)) {
      const collection = app.findCollectionByNameOrId(name)
      collection.listRule = ADMIN
      collection.viewRule = ADMIN
      app.save(collection)
    }
  }
)
