# PSEO Tracker: Data Protection Plan

## The risk
All tracker data is stored on one server. If that machine's Windows install gets corrupted, its disk fails, or Windows is reinstalled, the data could be lost.

## The solution

**1. Automatic daily backups to the cloud**
Every night at 02:00 the server backs up all data to a cloud storage bucket (Cloudflare R2 or Backblaze B2, which have free plans). The backups are kept off the server, so they survive even if the server is destroyed. The last 14 days of backups are kept. At most one day of data can be lost.

**2. Data stored separately from Windows**
On an office PC, the data is kept on a separate drive (D:), not the Windows drive (C:). Reinstalling Windows does not touch it.

**3. Corruption prevention**
- The server shuts down cleanly when Windows shuts down, so the database never stops in the middle of a write.
- A UPS (battery backup) protects the server PC against power cuts.
- Sleep is turned off, and Windows Update is set not to restart the server during working hours.

**4. Monthly restore test**
Once a month, the latest backup is restored on a test copy and checked, to confirm that the backups actually work.

**5. Tracking continues during outages**
If the server goes down, each employee's app keeps recording time locally. It uploads the data automatically once the server is back, so tracked time is not lost.

## If the server fails completely
1. Set up a new machine.
2. Install the server software.
3. Restore the most recent backup from the cloud.

## Recommended hosting
Hosting the server on a cloud machine (Oracle Cloud's free tier) instead of an office PC removes the Windows risk entirely. Cloud backups would still be used on top.

**Cost of all of the above:** free. The only optional purchase is a UPS for the office-PC setup.

---

# Employees Who Are Active but Not Responding

## The problem
An employee can show as active, in Slack or in our tracker, without replying to messages. "Active" only means the keyboard or mouse is being used. It doesn't show whether the person is responding.

## The solution: Ping and acknowledge

**1. Ping**
From the Live Board, a manager can ping any employee.

**2. Acknowledge**
A Windows notification appears on the employee's PC with an **"I'm here"** button. The time they click it is recorded.

**3. Missed pings**
If the employee doesn't respond within the set time (for example 10 minutes), the manager is notified automatically.

**4. Response report**
For each employee, the report shows pings sent, pings answered, pings missed and the average response time.

**5. Focus status**
Employees can mark themselves "Focus / In a meeting", so time spent on deep work is not counted as ignoring messages.

## Response rule
The client sets a response time rule, for example "reply within 15 minutes during shift hours". The app measures against that rule.

## Later: Slack
After launch, the same ping can be sent as a Slack message with an Acknowledge button. Responses go to the same report.
