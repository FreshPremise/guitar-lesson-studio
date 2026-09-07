# Firebase Hosting plan

Status: **deployed and verified on September 7, 2026.**

Live demo: https://guitar-lesson-studio.web.app

Source/download: https://github.com/FreshPremise/guitar-lesson-studio (public).

Current hosted version: **0.9.3**, release `2f096e2b6b414191`, verified September 7, 2026. The downloadable source and hosted demo share the current application features: a physical 24-fret neck, resizable selection panel, expanded workspaces with amber buttons, accessible scrolling in short windows, and an organized Guide with integrated credits. Physical fret 7 has two dots and fret 12 has three. Hosting builds add the Demo/GitHub notice to the title bar. The separate credits page is removed; attribution remains in the Guide and asset licenses.

Firebase project and Hosting site: `guitar-lesson-studio`. The initial release is Hosting version `fad3b95143b0d319`. Only static Hosting was deployed; no billing upgrade, database, Firebase Authentication, Cloud Functions or analytics was configured. The hosting build adds the Demo/GitHub notice; the local application retains its original title presentation.

Live verification confirmed all 51 current published files match the build hashes, all configured headers are applied, HTTPS includes HSTS, and private/source/configuration/review paths plus the build manifest return 404. Isolated, muted browser regression checks passed, including backups, editing, playback controls and responsive layouts. This is evidence for a small static-app attack surface, not a guarantee against all vulnerabilities. The earlier Codex Security Standard source scan had zero reportable findings; live deployment verification is a separate check.

The Windows Firebase emulator has a URL-pattern matching limitation that prevented its custom headers from appearing locally. The actual Hosting service applies the unchanged configuration correctly. Use live response checks when validating future releases.

## Recommended setup

Use Firebase Hosting for this static HTML/CSS/JavaScript app. No Firebase SDK, database, authentication service, Cloud Functions or server-side app is needed. The Node server is only for local use.

`firebase.json` points at **dist/**. `npm run build` copies explicit public files there. Private notes, saved music, development logs and source-review material are excluded. The source repository and hosted site use different file lists.

The configuration includes a same-origin Content Security Policy, frame restrictions, MIME protection, no-referrer policy and disabled camera/microphone/geolocation permissions. Files revalidate to avoid stale modules after an update. No single-page routing rewrites are needed.

## Future updates

1. Review changes and retain all sound/font attribution. A source-code reuse license remains a separate owner decision.
2. Explicitly target `guitar-lesson-studio`; avoid changing other projects or billing settings.
3. Export your local music as JSON. A hosted origin starts with separate browser storage; import the backup there. Hosting does not upload or synchronize local storage.
4. Run tests, both build commands and the release audit. Inspect the screenshot and file manifests.
5. Use the authenticated Firebase CLI and the explicit project ID. Never commit sign-in state, service-account keys, tokens or `.firebaserc`.

## Deployment commands

After reviewing and authorizing an update:

```sh
npm run build
firebase emulators:start --only hosting --project guitar-lesson-studio
```

Verify headers, samples, exports and reload behavior in the emulator. If approved, upload a short-lived preview:

```sh
firebase hosting:channel:deploy review --expires 1d --project guitar-lesson-studio
```

A preview channel uploads files and creates an accessible URL; it is not an access-controlled private review space. Upload only the reviewed static app. Publish production after the preview is accepted:

```sh
firebase deploy --only hosting --project guitar-lesson-studio
```

Verify HTTPS, keyboard use, audio, downloads, storage and headers on the actual site. Keep the prior Hosting version available for rollback. Add automated GitHub deployments only after the manual workflow and permissions are reviewed.

## Privacy distinction

The app has no analytics, tracking SDKs, remote fonts or remote audio. Saved music stays in the browser. A hosted copy still makes normal requests to Firebase/Google infrastructure, which handles request metadata under its policies. Do not describe hosting as involving no third-party network contact.

Cloud synchronization would require separate authentication, access rules, retention/deletion design and security review.

## Official references

- [Hosting quickstart](https://firebase.google.com/docs/hosting/quickstart)
- [Public directories and response headers](https://firebase.google.com/docs/hosting/full-config)
- [Preview and deployment workflow](https://firebase.google.com/docs/hosting/test-preview-deploy)

Approach checked against official documentation on September 6–7, 2026. The initial production deployment and live checks completed September 7, 2026. Preview channels remain an optional future workflow; none was created for the initial release.
