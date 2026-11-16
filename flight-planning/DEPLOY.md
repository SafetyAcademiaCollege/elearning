# Flight Planning — deployment

Target URL: `https://safetyacademia.aero/flight-planning/`

This folder is a complete static web app. There is no build step and no server code.
Upload the folder as-is so the files sit at:

```
/flight-planning/.htaccess
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

## Hostinger (hPanel) upload
1. hPanel → Websites → safetyacademia.aero → Files → File Manager.
2. Open `public_html`. Create a folder named `flight-planning`.
3. Open it, click Upload, choose `flight-planning.zip`, then right-click the zip → Extract (into the current folder). Delete the zip afterwards.
4. Check that `index.html`, `sw.js`, `.htaccess` and the `icons` folder sit directly inside `public_html/flight-planning/` (not in a nested `flight-planning/flight-planning/`).
5. Open https://safetyacademia.aero/flight-planning/ — if the main site is WordPress, it is unaffected: a real folder takes priority over WordPress routing.

## Releasing an update
1. Edit `index.html` (e.g. new AIRAC data, new aircraft).
2. Bump `VERSION` at the top of `sw.js`.
3. Upload both files. Installed copies update on the next online launch.

## Data review
Aerodrome data reflects AIP Georgia AIRAC effective 09 Jul 2026. Review on each 28-day AIRAC cycle.
