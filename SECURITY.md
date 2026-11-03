# Security Policy

This is a static, client-only site: no server, accounts, cookies or
third-party scripts. Data stays in the URL hash and the browser's
`localStorage`.

## Reporting a vulnerability

If you find a problem (for example, a way to inject script through a share
link or a saved build), please open a
[private security advisory](../../security/advisories/new) on this repository
instead of a public issue. I'll respond as soon as I can.

## Guidelines for contributors

- Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`
  or `eval` with dynamic data. Use `textContent` and `createElement`.
- Validate anything read from the URL or storage through `sanitizeState`.
- Don't add external scripts or CDNs. Vendor any dependency into the repo
  and keep the Content Security Policy in `index.html` strict.
- Never commit secrets. This project needs none.
- The site must never fetch data at runtime. Game data comes from
  `tools/update_data.py`, run locally, with changes reviewed via `git diff`.
  Keep that script on the Python standard library only, and don't relax its
  host allow-list, size limits or field validation.
