Workout exports and web sharing
===============================

Export rendering uses its own fixed 1200-pixel canvas, local Inter fonts and
the existing monochrome identity. It does not capture the visible app or
depend on mobile viewport width. PNG balances divisions across two columns
when there are multiple divisions. PDF renders A4 pages with repeated plan
and division headings; ordinary exercise rows stay together. Oversized rows
continue across pages, preserving all text. PNGs exceeding the image height
limit fail with a suggestion to use PDF instead of silently truncating.

Text sharing retains the existing division-aware formatting. Desktop image
and PDF sharing reserves a WhatsApp tab during the click, downloads the file,
and opens the conversation for manual attachment. If the browser blocks the
tab, the status message includes an explicit WhatsApp link. Mobile web tries
file sharing when available and falls back to download on unsupported files,
missing support or errors. Cancelling the share sheet does not trigger a
download. A native share sheet does not guarantee WhatsApp is selected or
that a message is sent.

Capacitor dependencies and tracked Android wrapper/configuration files were
removed after confirming that MainActivity only extended BridgeActivity.
IDE-locked generated Android caches can remain locally and are ignored at
the root; they are not part of the web build. PWA configuration, local fonts,
html2canvas and jsPDF remain. Database schemas, RPCs, authentication and
workout persistence were not changed. The obsolete student diagnostic panel
and its redundant mirrored list were removed; student loading and CRUD remain.

Automated checks
----------------

```powershell
node --test tests/*.test.mjs
npm run build
git diff --check
```

For a real headless Chrome export check, start Vite in a separate terminal
and install playwright-core outside the project:

```powershell
npm run dev -- --host 127.0.0.1
# In another terminal:
$testRoot = Join-Path $env:TEMP 'power-gym-export-validation'
npm install --prefix $testRoot --no-save --package-lock=false playwright-core
$env:PLAYWRIGHT_MODULE_PATH = Join-Path $testRoot 'node_modules/playwright-core/index.mjs'
$env:CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node tests/workout-export.browser.mjs
```

This uses synthetic fixtures, blocks Supabase requests and performs no
WhatsApp communication. It checks identical PNG bytes at 390px and 1440px,
multi-page A4 PDF output and practical compressed file size. Artifacts are
written to the temporary test directory for visual inspection.

Manual browser tests still required
-----------------------------------

- Android Chrome and iOS Safari/PWA: share PNG and PDF to WhatsApp, cancel the
  sheet, deny sharing, and verify the download fallback and manual-attachment
  message. Test iPad desktop-mode detection and browser activation restrictions.
- Desktop Chrome/Edge/Safari: confirm downloads and the correct student
  conversation, both with popups allowed and blocked; manually attach a file.
- At narrow widths and with the on-screen keyboard: verify the WhatsApp menu
  stays inside the viewport and all three choices remain reachable.
- Open and print the PDF in actual viewers: verify A4 pages, long exercise
  names, blank divisions, accented names and absence of clipped rows. PDF text
  is rasterized; it is not selectable. Check real production plan sizes.
- Reinstall/reload the PWA and verify locally bundled fonts and offline shell.

Existing database tests may be skipped unless PGLITE_MODULE_PATH is configured
as described in supabase/README.md. No additional project dependency is needed
for either optional browser or isolated database checks.
