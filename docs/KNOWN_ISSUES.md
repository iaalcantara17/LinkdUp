# Known Issues

- **Google Calendar is limited to test users.** The Google OAuth app is in Testing mode, so only accounts added as test users in the Google Cloud console can connect. Everyone else should use **Download .ics** on the confirmation screen, which works in any calendar app with no connection.
- **Native iOS and Android are untested.** The app is built and tested on the web. The native builds have not been run on devices.
- **The API sleeps when idle.** The server runs on Render's free tier and sleeps after a period without traffic. The first request after that can take up to a minute while it wakes up.
- **Venue lookups have daily caps.** Google Places calls have a daily quota. When it runs out, venue search pauses with "Venue lookups are paused for today, try again tomorrow" until the quota resets.
