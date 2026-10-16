# Manager test plan

Repo copy of the "Manager" tab in the **PSEO Tracker test plans** Claude Doc (results are recorded there). Setup and accounts: [README.md](README.md).

Sign in as Bilal (manager of Alpha). Sana manages Bravo; use her to check team boundaries. Run the Employee plan's own-account tests once as a manager too. **★** = smoke test before every update. **Auto** = ✓ checked by `npm run test:all`, – manual only.

## 1. Own account, Quit and switching

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| M-01 | Sign in | Sign in as bilal@test.local | Lands on the Live Board; the top bar shows "Manager" | ★ |  |
| M-02 | Manager menu | Look at the sidebar | My Stats, My Leaves, Calendar, Project, Live Board, Attendance, Reports, Rules; no Organization or Finance (hidden for managers for now). Own attendance is Attendance → My attendance; approvals are tabs in My Leaves |  |  |
| M-03 | Own tracking and leave | Run E-20 to E-22, E-40 and E-50 to E-63 once as Bilal | Same results as for an employee |  |  |
| M-04 | Quit from the tray | Right-click the tray icon → Quit | Quit is there; the app closes cleanly (no error) | ★ | – |
| M-05 | Quit from the profile menu | Profile menu → Quit PSEO Tracker | The app closes cleanly |  |  |
| M-06 | Own leave goes to the admins | Bilal applies for Casual leave | Not in his own My Leaves → Pending; it appears in the admin's Pending and the admin's bell rings | ★ | ✓ |
| M-07 | Switch account | Switch account to asma@test.local, then back to bilal@test.local | Employee view as Asma; getting back needs Bilal's password |  |  |

## 2. Live Board

Keep a second test app open as an Alpha employee (`npm run test:app -- --as asma@test.local`) to see changes arrive.

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| M-10 | Own team only | Open the Live Board | Alpha people only (Asma, Bilal, Chand, Nadia); nobody from Bravo | ★ | ✓ |
| M-11 | Statuses | With Asma's test app open and in use | Asma Active with today's time; people without an open app Offline |  |  |
| M-12 | Idle shows | Leave Asma's PC untouched for 6 minutes | Her card turns Idle |  | – |
| M-13 | On leave shows | Approve leave for today for an Alpha person who is offline | Their card shows On leave |  | ✓ |
| M-14 | Live without refresh | Watch the board while Asma signs in or goes idle | Cards change within seconds without leaving the page |  | ✓ |
| M-15 | New hire appears | The admin adds an employee to Alpha | A new card appears without refreshing |  | ✓ |
| M-16 | Search and filters | Search a name; click Active, Idle, On leave, Offline | The list narrows; the counts on the buttons are right |  |  |

## 3. Approvals (My Leaves tabs)

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| M-20 | Pending queue | My Leaves → Pending | Chand's Casual request with days, reason and his paid days left; Sana's request is not there | ★ | ✓ |
| M-21 | Approve with a comment | Approve Chand's request with a comment | It leaves Pending; Chand's balance goes down; Chand's bell shows the approval and the comment | ★ | ✓ |
| M-22 | Reject with a reason | Have Asma apply, then reject it with a reason | Asma sees Rejected and the reason; her balance is unchanged |  |  |
| M-23 | Decided history | My Leaves → Decided | Who, when and the comment for each decision; no buttons to change a decision |  | ✓ |
| M-24 | Team balances | My Leaves → Team balances | Alpha people only; days left and used per type; the search works |  | ✓ |
| M-25 | New requests arrive live | Keep Pending open while Asma applies | It appears without refreshing |  | ✓ |
| M-26 | Can't change a decision | (server check) Reverse an approval as a manager | Refused: only an admin can |  | ✓ |
| M-27 | Other teams and managers | (server check) Decide a Bravo request, or a manager's request in your team | Refused: managers' leave is decided by an admin |  | ✓ |
| M-28 | Admin decisions are off limits | (server check) Decide the admin's own leave, or change the comment on a decision an admin made | Refused |  | ✓ |

## 4. Attendance and Reports

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| M-30 | Attendance grid | Open Attendance | Alpha people × days: Chand's Absent and Half day, Asma's On leave and Late, the Holiday column | ★ | ✓ |
| M-31 | Month and legend | Previous and next month; check the legend | Moves between months; future days empty; legend matches the cells |  |  |
| M-32 | No recount for managers | Look for Recount days | Not offered to a manager (admin only) |  | ✓ |
| M-33 | Leaver's days stop | Find Faisal | Days only up to his leaving date |  | ✓ |
| M-34 | Reports | Reports: daily, weekly, monthly; team and employee filters; a date range | Alpha people only; active and idle per person and period | ★ |  |
| M-35 | CSV export | Export CSV and open it | Same rows and totals as the screen, plus decimal hours |  |  |
| M-36 | Other teams refused | (server check) Ask for Bravo's report | Refused |  | ✓ |

## 5. Calendar and notifications

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| M-40 | Team leave on the calendar | Open Calendar | Approved leave of Alpha people shows; Bravo people's does not |  | ✓ |
| M-46 | Team events only for the team | As Bilal (Alpha) and then as Sana (Bravo) | "Alpha sprint review" shows for Bilal, not for Sana |  |  |
| M-41 | No calendar editing | Look for add or edit on Month and Holidays | None for a manager |  | ✓ |
| M-42 | Bell on a new request | Asma applies for leave | Bilal's bell goes up by one: "Asma Khan asked for leave"; clicking it opens My Leaves → Pending | ★ | ✓ |
| M-43 | Other teams don't ring | Danish (Bravo) applies | Bilal's bell does not change |  | ✓ |
| M-44 | Project: own clients only | Project as Bilal | Only Acme Dental; the team's status and month totals; no New client, Edit, Add people or × | ★ | ✓ |
| M-45 | Project calendar | Acme Dental → Calendar → add "Test call" tomorrow 10:00; edit it; delete it | All allowed; the day view says "Added by Bilal Manager"; Asma sees it too |  | ✓ |

## 6. Limits

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| M-50 | Admin pages blocked | (automated) Open the Organization address, then any Finance address (Payroll, Salaries, My pay) | Sent back to the Live Board | ★ |  |
| M-51 | No Finance tab | Look at the sidebar; (server check) read salaries or payroll | No Finance item; the server still returns only Bilal's own salary and finalized lines, nothing from his team |  | ✓ |
| M-52 | No rule or calendar changes | (server check) Change rules, leave types, holidays, events or teams | Refused |  | ✓ |
| M-53 | No staff admin | (server check) Add an employee, reset a password, deactivate someone | Refused |  | ✓ |
| M-54 | Can't change own role or team | (server check) | Refused |  | ✓ |
| M-55 | No attendance or payroll edits | (server check) Write attendance or payroll | Refused |  | ✓ |
