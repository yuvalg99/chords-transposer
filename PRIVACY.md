# Privacy Policy — Chords Transposer

**Last updated: September 21, 2026**

Chords Transposer collects nothing.

The extension does not collect, store on any server, transmit, sell, or share any
personal or sensitive user information. There are no accounts, no analytics, no
telemetry, no advertising, no crash reporting, and no third-party services of any
kind. The extension makes no network requests at all — every chord is parsed,
transposed, drawn, and sounded locally in your browser.

## What is stored on your device

The extension uses Chrome's local extension storage (`chrome.storage.local`) to
remember your own settings between page loads. This data never leaves your
computer and is not readable by the websites you visit or by anyone else:

- **Per-song transpose state** — how many semitones you moved a song, saved under
  a key derived from the page address so the song reads the same when you come
  back to it.
- **Display preferences** — accidental spelling, chord diagrams on or off, sound
  on or off, auto-scroll speed, panel position and size.
- **Per-site off switch** — the list of sites where you chose to turn the
  extension off.

## Deleting your data

- Click the extension icon and use **Forget saved songs** to clear saved transpose
  state.
- Removing the extension from `chrome://extensions` deletes all of its stored
  data.

## Permissions and why they are needed

- **`storage`** — to save the settings described above on your device.
- **`activeTab`** — when you click the toolbar icon, this lets the popup talk to
  the page you are currently looking at, so it can read the current key and apply
  a transpose. It applies only to that one tab, only while the popup is open.
- **Access to all websites** (the `*://*/*` content script match) — chord and tab
  sheets live on thousands of sites, from large archives to personal songbooks
  and forum posts, so there is no fixed list of addresses that would cover them.
  The script is passive: it reads the page's own visible text looking for chord
  patterns, and if the page is not a chord sheet it does nothing at all — no
  interface, no stored data, no change to the page. It never reads passwords,
  form fields, or cookies, and it never sends anything anywhere.

## Remote code

The extension runs only the code shipped inside its package. It does not
download, inject, or evaluate code from any remote source.

## Children

The extension collects no data from anyone, including children.

## Changes to this policy

If this policy ever changes, the updated version will be published at this
address with a new date at the top.

## Contact

Questions about this policy: <ADD-YOUR-CONTACT-EMAIL>
