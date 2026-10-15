# Employee test plan

Repo copy of the "Employee" tab in the **PSEO Tracker test plans** Claude Doc (results are recorded there). Setup and accounts: [README.md](README.md).

Sign in as an employee of the test company (Asma, Alpha team, unless a test says otherwise). **★** = smoke test before every update. **Auto** = ✓ checked by `npm run test:all`, – manual only.

## 1. Sign-in and account

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| E-01 | Sign in | Sign in as asma@test.local / Test-pass-123 | Lands on My Stats; the top bar shows "Employee" and Switch account | ★ |  |
| E-02 | Wrong password | Sign in with a wrong password | "Email or password is incorrect, or your account is inactive."; still on sign-in |  |  |
| E-03 | Deactivated account | Sign in as faisal@test.local | Same error; no way in |  | ✓ |
| E-04 | First sign-in | Sign in as newhire@test.local / Temp-pass-1 | The Change password screen comes before anything else | ★ |  |
| E-05 | New password rules | On that screen try a too-short password, then two that don't match | A clear error for each; nothing saved |  |  |
| E-06 | Tracking notice | Set a valid new password | The tracking notice explains what is tracked (active/idle only, no screenshots or app names); the app opens only after Accept |  |  |
| E-07 | Old password stops working | Log out, sign in with Temp-pass-1 | Refused; the new password works |  |  |
| E-08 | Session survives a restart | Open a test app without --as, sign in, close it (Task Manager), open it again without --as | Still signed in, straight to My Stats |  |  |
| E-09 | Log out | Profile menu → Log out | Back on the sign-in screen |  |  |
| E-10 | Switch account: wrong password | Switch account → chand@test.local with a wrong password | Error shown; still signed in as Asma |  |  |
| E-11 | Switch account: same account | Switch account → asma@test.local | "You are already signed in as this account." |  |  |
| E-12 | Switch account: another person | Switch account → chand@test.local / Test-pass-123 | The app now shows Chand (his pending Casual in My Leaves); the dialog warned that tracked time goes to him | ★ |  |
| E-13 | No free role switching | Look at the top bar | Only the role label and Switch account; no "View as" dropdown |  |  |
| E-100 | Create an account | Sign-in page → Create an account: name, email typed with some capitals, phone, the same password twice | "Account created. It now waits for your admin's approval"; signing in before approval says the account is waiting for approval | ★ | ✓ |
| E-101 | Create an account: checks | Try a too-short password, two different passwords, then an email that already has an account | A clear error for each; no account created |  | ✓ |
| E-102 | Create an account: back | On Create an account click "Sign in" | Back on the sign-in form |  |  |
| E-103 | Sign in after approval | After the admin approves (A-90), sign in typing the email with capital letters | Signed in → tracking notice → My Stats |  | ✓ |
| E-104 | Too many sign-ups | Create 6 accounts from one PC within a minute | The 6th: "Too many sign-ups from this PC. Wait a minute and try again." |  | ✓ |

## 2. Tracking engine and tray

Run these during shift hours (09:00–18:00, Mon–Fri) unless a test says otherwise. Compare times with the tray tooltip and My Stats.

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| E-20 | Active time counts | Use the keyboard and mouse for 10 minutes | Active time grows by about 10 min; tray tooltip and My Stats agree | ★ | – |
| E-21 | Idle after the limit | Don't touch the PC for 7 minutes, then move the mouse | Idle after about 5 min; the 5 waiting minutes are counted as idle, not active |  | – |
| E-22 | Back to active | While idle, move the mouse | Active again within about 15 seconds |  | – |
| E-23 | Outside shift hours | After 18:00, at the weekend, or after the admin moves the shift | My Stats says "Outside shift hours"; no time added |  | – |
| E-24 | Screen lock pauses | Lock Windows (Win+L) for 3 minutes | No time added while locked; tracking resumes after unlock |  | – |
| E-25 | Sleep pauses | Put the PC to sleep for 3 minutes | No time added while asleep |  | – |
| E-26 | Offline work is kept | Disconnect the network for 10 minutes while working, then reconnect | The tray shows segments waiting to sync; after reconnecting they upload, no duplicates, totals match |  | – |
| E-27 | A wrong PC clock is refused | (server check) Time sent from a PC whose clock is 1 hour ahead | Rejected and logged; never counted |  | ✓ |
| E-28 | Close keeps tracking | Close the window with X | The app stays in the tray; tracking continues |  | – |
| E-29 | No Quit for employees | Right-click the tray icon; open the profile menu | Tray: Open, today's time, status, no Quit. Profile menu: no Quit | ★ | – |
| E-30 | One copy only | Start the app again while it runs | The open window comes to the front; no second copy |  | – |
| E-31 | Tray icon shows the state | Watch the dot on the tray logo | Green active, amber idle, grey off, red signed out |  | – |
| E-32 | Same person on two PCs | (server check) Two overlapping pieces of time for one person | The second is refused, so time is never counted twice |  | ✓ |

## 3. My Stats and My Attendance

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| E-40 | My Stats today | Open My Stats | Today's active and idle in Xh Ym, a status badge, this week's totals | ★ |  |
| E-41 | Week matches the days | Compare this week in My Stats with the same days in My Attendance | The active time per day agrees |  |  |
| E-42 | My Attendance month | Open My Attendance | Every past working day has a status; today says "Counted tonight"; weekends are marked |  |  |
| E-43 | Statuses are right (Asma) | Find Asma's approved Sick day, the Test Holiday and her late day | On leave, Holiday and Late badges; first and last activity times shown | ★ |  |
| E-44 | Absent and half day (Chand) | Switch account to Chand, open My Attendance | One Absent day and one Half day |  |  |
| E-45 | Month picker | Go to the previous month and back | The rows change; it won't go past the current month |  |  |
| E-46 | Month totals | Check the totals strip at the top | Each status count equals the matching rows |  |  |

## 4. My Leaves

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| E-50 | Balances | Open My Leaves as Asma | Sick 7 of 8 left (1 used), Casual 10 of 10, Annual 14 of 14 | ★ |  |
| E-51 | History with the decision | Look at the requests list | The approved Sick day shows Bilal Manager and "Get well soon" |  |  |
| E-52 | Working-days preview | Apply for leave → Casual, Monday to Friday of next week | "5 days will be counted"; stretching it over the weekend is still 5 | ★ |  |
| E-53 | Holidays aren't counted | Ask the admin to add a holiday next week, then preview the same week | 4 days |  |  |
| E-54 | Half day | Tick Half day | The end date locks to the start date; 0.5 day |  |  |
| E-55 | End before start | Set To earlier than From | "The end date must be on or after the start date." |  | ✓ |
| E-56 | Weekend only | Pick a Saturday and Sunday | "There are no working days in these dates (only weekends or holidays)." |  | ✓ |
| E-57 | Across the new year | 31 Dec to 1 Jan | "Leave can't run across the new year..." |  | ✓ |
| E-58 | More than 60 days | A range longer than 60 days | "A request can cover at most 60 days." |  |  |
| E-59 | Overlap | Dates that overlap a pending or approved request of yours | "These dates overlap your ... leave on ..." |  | ✓ |
| E-60 | Over the quota | Sick for 8 working days | "Only 7 days of Sick leave left this year; this request needs 8." |  | ✓ |
| E-61 | Before the joining date | As Erum, a day before she joined | "Leave can't start before your joining date (...)" |  | ✓ |
| E-62 | Send a request | Send a valid Casual request | Listed as Pending; the balance card shows it as pending; Bilal's bell rings (Manager plan M-42) | ★ |  |
| E-63 | Cancel while pending | Cancel that request | Cancelled; the pending days return to the balance; no Cancel button any more |  | ✓ |
| E-64 | Approved can't be cancelled | Look at the approved Sick row | No Cancel button (only an admin can cancel approved leave) |  | ✓ |
| E-65 | Sick leave sent afterwards | Apply Sick for a past working day | Allowed |  |  |
| E-66 | Decision arrives live | Keep My Leaves open while the manager decides | The row updates by itself; the bell goes up by one |  |  |
| E-67 | Rejection with a reason | Switch account to Danish, open My Leaves | The Annual request is Rejected with "Client deadline that week" |  |  |
| E-68 | Emergency leave | Apply for leave → Leave type | "Emergency (unpaid)" is in the list; it has no yearly limit |  |  |

## 5. Calendar, notifications, profile, settings and pay

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| E-70 | Month calendar | Open Calendar | The month grid shows the Test Holiday, Asma's approved leave day and "Company town hall" tomorrow 11:00–12:00 | ★ |  |
| E-71 | Team events only for the team | As Asma (Alpha) and then as Danish (Bravo) | "Alpha sprint review" shows for Asma, not for Danish |  |  |
| E-72 | Day view | Click a day with entries | Everything on that day is listed |  |  |
| E-73 | Calendar is read-only | Look for add or edit buttons on Month and Holidays | None for an employee |  | ✓ |
| E-74 | Notification bell | After a decision on your leave, open the bell | Unread count, the decision with who decided and the comment; clicking opens My Leaves and marks it read | ★ |  |
| E-75 | Mark all as read | Bell → Mark all as read | The badge clears; the items stay in the list |  |  |
| E-76 | Edit profile | My Profile: change name, phone and designation, upload a photo | Saved; the photo shows in the top bar |  |  |
| E-77 | Profile limits | Look for role, team and email fields | Not editable by the employee |  | ✓ |
| E-78 | Theme | Settings: Light, Dark, System | The whole app switches; the choice is kept after a restart |  |  |
| E-79 | Start with Windows | Settings, in an installed copy (Admin plan A-85) | On and locked for an employee |  | – |
| E-80 | Logs folder | Settings → Open logs folder | Explorer opens the folder with main.log |  | – |
| E-81 | Others' notifications are private | (server check) Read or change someone else's notification | Refused |  | ✓ |
| E-82 | My pay | Open Finance as Asma | Lands on My pay: salary PKR 90,000 and the three months before this one, each with its net pay; clicking a month shows its breakdown; no Run payroll, Salaries or edit buttons | ★ |  |
| E-84 | Project: my clients | Project as Asma | Tabs Acme Dental and Bluefin Media only; teammates' status and month totals, no hours; no admin buttons | ★ | ✓ |
| E-85 | Project calendar | Acme Dental → Calendar → Add event | Saved and shown as "Added by Asma Khan"; others on Acme Dental can change it; the team's approved leave shows as "On leave", without the leave type |  | ✓ |
| E-86 | Other clients are private | (server check) Read Northwind Realty's status, leave or calendar as Asma | Refused or empty |  | ✓ |
| E-83 | Only your own pay | Open the `#/finance/payroll` or `#/finance/salaries` address; (server check) read salaries or payroll | Sent back to My pay; only your own salary and your own lines in finalized months come back; nothing can be changed |  | ✓ |

## 6. Limits, resilience and display

| ID | Check | How | Expected | ★ | Auto |
| --- | --- | --- | --- | --- | --- |
| E-90 | Employee menu only | Look at the sidebar | Only My Stats, My Attendance, My Leaves, Calendar, Finance | ★ |  |
| E-91 | Manager pages blocked | (automated) Open the Live Board, Approvals or Organization address | Sent back to My Stats |  |  |
| E-92 | Other people's data is private | (server check) Read another person's attendance, leave, time, live status or salary | Refused or empty |  | ✓ |
| E-93 | Can't decide own leave | (server check) Approve your own request | Refused |  | ✓ |
| E-94 | Can't promote yourself | (server check) Change your own role or team | Refused |  | ✓ |
| E-95 | Server unreachable | Signed out: disconnect the network. Signed in: disconnect, then send leave | Signed out: the connection panel replaces sign-in (no form). Signed in: "Cannot reach the server. Check your connection..."; nothing half-saved; tracking keeps queuing |  |  |
| E-105 | No internet | Disconnect the PC from the internet, then open the app signed out | "Can't reach the server" (check the internet, or the server PC may be off); no form; when the connection is back, sign-in appears by itself | ★ |  |
| E-106 | Any internet connection | On a PC outside the office (another Wi-Fi or mobile hotspot), with only the app installed | Sign in and Create an account work; no Tailscale or setup file needed | ★ |  |
| E-107 | Server PC off | Stop the server (or switch off the server PC) while signed out | "Can't reach the server"; Check again works; when the server is back, the sign-in form appears by itself within about 5 s |  |  |
| E-96 | Smallest window | Resize the window to its minimum (960 × 600) | Every screen still usable; nothing overlaps or is cut off |  |  |
| E-97 | Dark mode everywhere | Switch to Dark and open every screen and dialog | Readable everywhere; no white boxes |  |  |
| E-98 | Long text | Very long leave reason, very long designation | Wraps neatly; no broken layout |  |  |
| E-99 | Empty states (new hire) | As Nadia after her first sign-in | My Stats at 0h 0m, "No leave requests yet", attendance with no past days; no errors |  |  |
