# Admin test plan

Repo copy of the "Admin" tab in the **PSEO Tracker test plans** Claude Doc (results are recorded there). Setup and accounts: [README.md](README.md).

Sign in as Ayesha (admin). Admins can do everything; these tests cover what only an admin can do, plus the system itself. **★** = smoke test before every update. **Auto** = ✓ checked by `npm run test:all`, – manual only.

## 1. Organization

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| A-01 | Sign in | Sign in as admin@test.local | Lands on the Live Board; the menu also has Organization, Rules and Finance | ★ |  |
| A-02 | Teams list | Organization → Teams | Alpha (Bilal) and Bravo (Sana) with their members |  |  |
| A-03 | Create a team | Add team "Gamma" with a manager | Saved and listed; that manager now sees Gamma on the Live Board |  |  |
| A-04 | Edit a team | Rename it and change its manager | Saved; the old manager no longer sees its people |  |  |
| A-05 | Employees list | Organization → Employees | Everyone, including Faisal marked inactive |  |  |
| A-06 | Add an employee | Add employee: name, email, team, role, joining date, salary, temporary password | Created; the person signs in with the temporary password and must change it | ★ | ✓ |
| A-07 | Duplicate email | Add someone with an existing email (different capitals) | Refused |  | ✓ |
| A-08 | Short temporary password | Use a password that is too short | Refused |  | ✓ |
| A-09 | No salary yet | Add someone without a salary | Allowed; Finance flags the missing salary |  | ✓ |
| A-10 | Employee detail | Open Asma | Profile, team, designation, salary, attendance and leave summary |  |  |
| A-11 | Reset a password | Reset Asma's password | Her open session is signed out at once; the new temporary password works and must be changed | ★ | ✓ |
| A-12 | Deactivate | Deactivate Chand with a leaving date | Signed out at once; can't sign in; leaving date shown; his history stays |  | ✓ |
| A-13 | Reactivate | Reactivate Chand | He can sign in again |  | ✓ |
| A-14 | Can't deactivate yourself | Try to deactivate Ayesha | Refused |  | ✓ |
| A-15 | Change role or team | Make Chand a manager, or move him to Bravo | Takes effect after his next sign-in; his menu and data scope change |  |  |
| A-16 | Long names | Add someone with a very long name and designation | Lists, cards and the detail page stay tidy |  |  |
| A-90 | Someone creates their own account | After E-100 | The bell: "New employee registered" with their name and email; clicking it opens Organization → Employees, where they're active with no team and salary 0 | ★ | ✓ |
| A-91 | Set up a registered person | Open them and set team, role, designation and salary | Saved; their manager sees them on the Live Board; payroll includes them once a salary is set |  |  |

## 2. Rules

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| A-20 | Work rules save | Rules → change grace minutes, idle limit, shift times; save; reload | The new values stay | ★ | ✓ |
| A-21 | Wrong values refused | Shift end before start; negative or empty numbers | A clear error per field; nothing saved |  |  |
| A-22 | Tracker uses the new idle limit | Set the idle limit to 2 minutes; leave a test app untouched | It turns Idle after about 2 minutes |  | – |
| A-23 | Working days | Add Saturday as a working day | Saturday counts in the leave preview and in attendance |  |  |
| A-24 | Leave types | Add "Unpaid" (not paid, quota 0); edit a quota; delete a test type | Shows in Apply for leave; unpaid has no limit; quotas update the balances |  |  |
| A-25 | Others can't change rules | (server check) A manager or employee changes rules or leave types | Refused |  | ✓ |

## 3. Calendar: holidays and events

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| A-30 | Add a holiday | Calendar → Holidays → add one working day | Shows on the Month view for everyone; after a recount, attendance marks it Holiday | ★ | ✓ |
| A-31 | Add a range | Add a 3-day holiday (e.g. Eid) | Three days added |  | ✓ |
| A-32 | Duplicate date | Add a holiday on a date that already has one | Refused, naming the existing holiday |  | ✓ |
| A-33 | Rename, move, delete | Change a holiday's name and date; delete one | Saved everywhere |  |  |
| A-34 | Holiday on a day off | Add one on a Saturday | Marked "Day off anyway" |  |  |
| A-35 | Company-wide event | Add an event for everyone | Every role sees it on the Month view at the right time | ★ | ✓ |
| A-36 | Team event | Add an event for Bravo | Bravo people and admins see it; Alpha people don't |  | ✓ |
| A-37 | End before start | Save an event that ends before it starts | Refused |  | ✓ |
| A-38 | Edit and delete events | Change an event's time; delete one | Saved everywhere |  |  |

## 4. Attendance, approvals, Live Board and Reports

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| A-40 | Attendance for everyone | Open Attendance; team filter | Both teams; the filter narrows to one |  | ✓ |
| A-41 | Recount days | Add a holiday on a past day, then Recount days over that range | That day changes to Holiday for everyone | ★ | ✓ |
| A-42 | Recount limits | Recount today or a range longer than 31 days | A clear message; nothing changes |  | ✓ |
| A-43 | A manager's request | Approvals → Pending | Sana's Casual request is there; approving it notifies Sana | ★ | ✓ |
| A-44 | Reverse an approval | Decided → Reject an approved request | Rejected; the days return to the balance; the employee is notified |  | ✓ |
| A-45 | Approve a rejection | Decided → Approve Danish's rejected request | Approved; the balance goes down |  | ✓ |
| A-46 | Cancel approved leave | Decided → Cancel leave | Cancelled; the days return; past days' attendance is recounted |  | ✓ |
| A-47 | Cancelled stays cancelled | Try to approve a cancelled request | Not offered; refused by the server |  | ✓ |
| A-48 | Team balances for everyone | Approvals → Team balances | Both teams; search works |  | ✓ |
| A-49 | Live Board for everyone | Open the Live Board | Both teams; the team filter works |  |  |
| A-50 | Reports for everyone | Reports, both teams, CSV export | Every team; the CSV matches the screen |  |  |

## 5. Finance

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| A-60 | Salaries | Finance → Salaries; edit one inline | Everyone listed; Danish flagged as missing; the edit saves and the total updates | ★ |  |
| A-61 | Run payroll | Finance → Payroll → run the current month | A draft with one line per person who has a salary; Danish named as left out; Erum (joined) and Faisal (left) flagged for an adjustment |  | ✓ |
| A-62 | Hand-check one person | Open Chand's breakdown; calculate by hand: day rate = 65,000 ÷ working days in the month; deductions = (absent days + unpaid leave days + 0.5 × half days) × day rate + late count × 500 | The app's figures equal yours (whole rupees) | ★ |  |
| A-63 | Adjustment | Set an adjustment of −5,000 with the note "Advance" | Net = salary − deductions − 5,000; the run totals update |  | ✓ |
| A-64 | Recount keeps adjustments | Run the same month again | Adjustments and notes kept; counted figures refreshed |  | ✓ |
| A-65 | CSV export | Export the run's CSV | Same lines and totals as the screen |  |  |
| A-66 | Finalize locks it | Finalize the run | Read-only: no adjustment edits, no delete, no reopen, no recount | ★ | ✓ |
| A-67 | Future month refused | Run a month after this one | Refused |  | ✓ |
| A-68 | Counted figures are locked | (server check) Edit deductions or base on a line | Refused; only adjustment and note can change on a draft |  | ✓ |
| A-69 | Nobody else sees pay | (server check) A manager or employee reads salaries or payroll | Empty or refused |  | ✓ |

## 6. System and the installed app

These use your real setup or a test PC, not the test company. Do them before a release.

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| A-80 | Database always on | Restart the PC, sign in to Windows, wait a minute | The database runs with no window; the "PSEO Tracker Database" shortcut says it is already running | ★ | – |
| A-81 | Dashboard | Desktop "PSEO Tracker Database Dashboard" shortcut; sign in as superuser | The dashboard opens |  | – |
| A-82 | Backups exist | Dashboard → Settings → Backups | Daily backups listed; creating one works |  | – |
| A-83 | Restore drill | Run `server\deploy\restore-drill.ps1` as in docs/deployment.md | A backup restores into a test copy and starts |  | – |
| A-84 | Installer | Build with `npm run dist`; install on a test PC | Installs as "PSEO Tracker" with the new logo; desktop and Start menu shortcuts |  | – |
| A-85 | Start with Windows | Sign out and in on the test PC as an employee, then as a manager | Starts hidden in the tray; the employee can't turn it off; a manager can | ★ | – |
| A-86 | Automatic update | Install an older version, publish a newer test release | Downloads by itself; installs when nobody is tracked or at quit; restarts as the new version |  | – |
| A-92 | Update notification | On a PC that is tracking, publish a newer release and wait for the download (or restart the app) | Windows notification "PSEO Tracker <version> is ready"; clicking it restarts into the new version within about 10 s; tracked time kept; the next start shows "PSEO Tracker updated to <version>" | ★ | – |
| A-87 | Local data survives an update | Check %APPDATA%\PSEO Tracker before and after the update | Still signed in; queued time not lost; logs kept |  | – |
| A-88 | Admin Quit | Tray → Quit and Profile menu → Quit PSEO Tracker | Closes cleanly; queued time is sent first |  | – |
| A-89 | Uninstall | Uninstall from Windows Settings | The app is removed and nothing keeps running |  | – |
