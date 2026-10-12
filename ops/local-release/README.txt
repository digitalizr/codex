HEARTH - YOUR LOCAL WINDOWS RELEASE

1. Install Docker Desktop for Windows and start it.
   Use its Linux containers engine (the normal default).
2. Extract the whole downloaded GitHub artifact ZIP into a folder.
   Keep all its files together; do not start files inside the ZIP.
3. Double-click Start-Hearth.cmd. The launcher checks the release files,
   loads the included image, waits for Hearth, and opens your browser.

Your pantry database stays in the Docker volume hearth_hearth-data.
The launcher reuses that same volume when you start a newer release.
It does not delete or overwrite the volume or copy database files.
Keep Docker Desktop running while you use Hearth.

The default address is http://localhost:3000 and is accessible only
from your laptop. To choose another port, create a plain-text .env
file beside Start-Hearth.cmd containing one line, for example:

HEARTH_PORT=3001

Then run the launcher again and use http://localhost:3001.
An existing HEARTH_PORT environment variable takes priority.
Do not edit the release's other files: their checksums are verified.

If Docker Desktop is stopped, start it and retry. If the launcher
reports Windows containers, switch Docker Desktop to Linux containers.
A platform mismatch requires a new artifact prepared for your Docker
engine's architecture (linux/amd64 for most Windows laptops).
For a busy port, choose another HEARTH_PORT; do not delete your data.
If a checksum fails, extract a fresh artifact and retry.

For automated runs:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-Hearth.ps1 -NoBrowser
  To skip the CMD wrapper's pause, set HEARTH_NO_PAUSE=1.
The execution-policy option applies only to this launcher process.
It does not change your Windows execution-policy settings.
