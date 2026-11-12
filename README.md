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

## Updating the data

1. Edit the full `family-tree.json` (kept outside this repo, on the Desktop).
2. Re-encrypt it, typing the family password when asked:
   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\encrypt.ps1
   ```
3. Commit and push `data/family-tree.enc.json`. GitHub Pages republishes in a minute or two.

Using the same password keeps everyone's access working. A new password locks out anyone who had the old one, including remembered devices.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `css/`, `js/app.js` | The site. Plain HTML/CSS/JS, no build step. |
| `data/family-tree.enc.json` | The encrypted family data. |
| `tools/encrypt.ps1` | Encrypts the full data file for the site. |
| `tools/add-people.ps1`, `tools/apply-memorials.ps1`, `tools/jsonio.ps1` | Helpers for merging new people and Find a Grave details into the full data file. |
| `tools/serve.ps1` | Tiny local web server for previewing (`http://localhost:8791/`). |
