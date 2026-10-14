PSEO Tracker: setting up a staff PC or laptop
=============================================

You need (from the admin):
  - this folder, with PSEO-Tracker-Setup-<version>.exe and the Tailscale installer in it
  - the Tailscale auth key (starts with tskey-auth-)
  - the employee's PSEO Tracker email and password (Organization > Add employee in the app)

On each PC or laptop, signed in to Windows as the employee:
  1. Copy this whole folder to the PC (USB stick, Google Drive, or a shared folder).
  2. Double-click "Set up this PC.cmd".
  3. Click Yes when Windows asks for permission, and paste the Tailscale auth key when asked.
  4. PSEO Tracker installs and opens. The employee signs in, chooses a new password and accepts
     the tracking notice.

From then on the app starts by itself whenever the PC starts, and records active and idle time
during shift hours. If the server can't be reached for a while, the time is kept on the PC and
sent later (up to 30 days).

To skip pasting the key on every PC, put it in a file named tailscale-key.txt in this folder.
Delete that file when you're done, and keep the folder private: the key lets a device join
the agency network.
