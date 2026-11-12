# Stemen–Netzley Family Tree

A private, password-protected family tree: a pedigree chart that grows up from whoever is viewing it, with siblings and their families opening sideways, and every relationship worked out from that person's point of view.

**Site:** https://josiahstemen.github.io/family-tree/ (family password required)

Open it for a particular family member with `?me=<id>`, for example `?me=miriam-stemen`.

## How the privacy works

- The only data in this repository is `data/family-tree.enc.json`, an encrypted copy of the full family file. Without the password it is unreadable.
- Encryption: PBKDF2-SHA256 (600,000 rounds, random salt) derives the keys; the data is AES-256-CBC encrypted and HMAC-SHA256 authenticated. The browser decrypts it locally after the password is typed; the password is never sent anywhere.
- "Remember on this device" keeps the derived key (not the password) in that browser until "Lock this device" is pressed in Settings, or until the data is re-encrypted with a new password.
- Children are shown by name only, even to people with the password.
- Use a long password (four or more random words). Anyone can download the encrypted file and try guesses offline, so length is what protects it.

## Family editing (currently off)

This is built in but switched off: no GitHub key has been set up, so the site is view-only and the button is hidden. Once switched on (steps below), anyone with the password can press **✎ Add to the tree** (or **Add or fix something about…** on a person's page) and, one large-print step at a time:

- add a mother or father, son or daughter, brother or sister, or husband or wife,
- fix or fill in dates, places, burial, work, and add notes,
- share a memory or story.

Every change shows a plain "Is this right?" summary before it saves, records who made it, and appears under **See recent changes**, where it can be undone.

How it works: a GitHub key that can only change this repository's files is sealed inside the encrypted data. A save downloads the newest encrypted file, decrypts it in the browser, applies the one change, encrypts it again with the same password key, and commits it. Other devices see it within a few minutes.

Because the key is inside the data, anyone with the password could in principle use it to change this repository. Keep the password within the family, and if it leaks, change the password and make a new key.

Switching it on (once):

1. Make a key at https://github.com/settings/personal-access-tokens/new: only the `family-tree` repository, **Contents: Read and write**, the longest expiry offered.
2. `powershell -ExecutionPolicy Bypass -File tools\set-edit-key.ps1` and paste it (stored on this PC, encrypted to your Windows account).
3. Run `tools\encrypt.ps1` (below) and push.

When the key expires, saving shows a "let Josiah know" message; make a new key and repeat steps 2–3.

## Updating the data yourself

1. Bring in what the family saved on the site:
   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\pull-edits.ps1
   ```
2. Edit the full `family-tree.json` (kept outside this repo, on the Desktop).
3. Re-encrypt it, typing the family password when asked:
   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\encrypt.ps1
   ```
   It refuses to run if the site has family changes your Desktop copy is missing.
4. Commit and push `data/family-tree.enc.json`. GitHub Pages republishes in a minute or two.

Using the same password keeps everyone's access working, including remembered devices. A new password locks out anyone who had the old one.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `css/`, `js/app.js` | The site. Plain HTML/CSS/JS, no build step. |
| `data/family-tree.enc.json` | The encrypted family data. |
| `tools/encrypt.ps1` | Encrypts the full data file for the site (and seals in the editing key). |
| `tools/pull-edits.ps1` | Decrypts the site's data back into the Desktop file, with a backup. |
| `tools/set-edit-key.ps1` | Saves the GitHub key used for family editing. |
| `tools/ftcrypto.ps1` | Shared encryption code for the scripts. |
| `tools/add-people.ps1`, `tools/apply-memorials.ps1`, `tools/jsonio.ps1` | Helpers for merging new people and Find a Grave details into the full data file. |
| `tools/serve.ps1` | Tiny local web server for previewing (`http://localhost:8791/`). |
