/// <reference path="../pb_data/types.d.ts" />
// M11: a salary of 0 means "not set yet". As a required number field, 0 counted as
// blank, so adding an employee without a salary failed and Salaries couldn't clear one.
// Payroll leaves out anyone whose salary is 0 and names them.

migrate(
  (app) => {
    const salaries = app.findCollectionByNameOrId('salaries')
    salaries.fields.getByName('monthly_salary_pkr').required = false
    app.save(salaries)
  },
  (app) => {
    const salaries = app.findCollectionByNameOrId('salaries')
    salaries.fields.getByName('monthly_salary_pkr').required = true
    app.save(salaries)
  }
)
