' Starts the PSEO Tracker database (PocketBase) in the background, with no window,
' on http://127.0.0.1:8090 using the pb_data folder next to this script.
' The "PSEO Tracker Database" scheduled task runs it when you sign in to Windows.
' If the database is already running, the second copy exits at once (port in use).
' To stop it: Task Manager > Details > pocketbase.exe > End task (or sign out).
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = """" & dir & "\pocketbase.exe"" serve --dir """ & dir & "\pb_data"" --http 127.0.0.1:8090"
CreateObject("WScript.Shell").Run cmd, 0, False
