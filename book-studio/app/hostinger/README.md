# Putting the Book Studio demo on Hostinger

The package `book-studio-demo-hostinger.zip` is the demo website, ready to upload.
Live AI runs through the Vercel function at `https://book-studio-demo.vercel.app/api/ai`;
the API key stays on Vercel, never on Hostinger.

1. hPanel → Websites → choose the website (or the free temporary address) → **File Manager**.
2. Open the website's root folder (`public_html`), or the folder of a subdomain such as
   `studio.safetyacademia.ge`. The demo must sit at the root of an address, not in a sub-folder.
3. Upload the zip and **Extract** it there. You should see `index.html`, `.htaccess` and an
   `assets` folder side by side. (If `.htaccess` is hidden, turn on "show hidden files".)
4. Open the address. Sign in with any email, or just press Sign in.

To rebuild the package: `npm run build:hostinger` in `book-studio/app`, then zip the
contents of `dist-hostinger/`.
