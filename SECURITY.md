# Security and privacy

Guitar Lesson Studio runs its music tools in the browser. No runtime package dependencies, account credentials, analytics, microphone access or cloud-saving services are included.

## Boundaries

- Music stays in browser local storage. It is not encrypted; other people using the same profile can access it.
- JSON imports are size-limited and validated as a whole. User content renders as text, not HTML. Older stored originals are retained; concurrent edits are blocked until reload.
- Downloads and clipboard actions are explicit. Keep personal exports out of public repositories.
- Audio/fonts load from the app's origin. Credit links visit external sites only when followed.
- The local server binds to loopback, serves an explicit file list and rejects unknown hosts and unsupported methods. It is not a production internet server.
- Firebase serves generated `dist/` files. Hosting receives normal network requests; saved music does not become cloud-synchronized.

## Release review

Separate source/hosting file lists exclude local notes, logs, backups, cached tools, repository metadata and snapshots. The README screenshot uses synthetic demonstration data in an isolated browser.

`npm run audit:release` checks file membership, hashes and credential/home-path/backup patterns. This supplements source and screenshot review; it does not prove arbitrary future content safe. Rebuild and review after changes.

The v0.7 review covered browser modules, server/launcher, release tools, tests, static pages and asset provenance. Machine-specific browser-test defaults were removed, legacy local-path checksums were excluded, and the HTTP method boundary was tightened. No embedded application credentials or private notebook exports were identified in the reviewed candidates.

The v0.8 follow-up reviewed fret-range and practice-speed validation, history controls and backup confirmation. These add no network services or permissions. The confirmation date is stored only in the current browser and is separate from exported music. A requested download is never presented as proof that a file was saved.

## Reporting a problem

Do not post credentials, personal backups or private exploit data in a public issue. Before public launch, the owner should enable private vulnerability reporting or provide a private contact channel. No reporting address is configured in this pre-release source.
