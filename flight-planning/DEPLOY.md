# Flight Planning — deployment

Target URL: `https://safetyacademia.aero/flight-planning/`

This folder is a complete static web app. There is no build step and no server code.
Upload the folder as-is so the files sit at:

```
/flight-planning/index.html
/flight-planning/sw.js
/flight-planning/manifest.webmanifest
/flight-planning/icons/icon.svg
/flight-planning/icons/icon-192.png
/flight-planning/icons/icon-512.png
```

Requirements on the host:
- HTTPS (the offline service worker will not register over plain HTTP).
- `sw.js` must be served from inside `/flight-planning/` (it is, if the folder is uploaded intact).
- Serve `.webmanifest` as `application/manifest+json` (most hosts do this already).

## Releasing an update
1. Edit `index.html` (e.g. new AIRAC data, new aircraft).
2. Bump `VERSION` at the top of `sw.js`.
3. Upload both files. Installed copies update on the next online launch.

## Data review
Aerodrome data reflects AIP Georgia AIRAC effective 09 Jul 2026. Review on each 28-day AIRAC cycle.
