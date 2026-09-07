# Firebase Hosting plan

Status: **prepared locally; no project connected and nothing deployed.**

## Recommended setup

Use Firebase Hosting for this static HTML/CSS/JavaScript app. No Firebase SDK, database, authentication service, Cloud Functions or server-side app is needed. The Node server is only for local use.

`firebase.json` points at **dist/**. `npm run build` copies explicit public files there. Private notes, saved music, development logs and source-review material are excluded. The source repository and hosted site use different file lists.

The configuration includes a same-origin Content Security Policy, frame restrictions, MIME protection, no-referrer policy and disabled camera/microphone/geolocation permissions. Files revalidate to avoid stale modules after an update. No single-page routing rewrites are needed.

## Before uploading

1. Finish visual review and select the GitHub source license. Retain all sound/font attribution.
2. Choose the Firebase account, project ID, site name and optional domain. Review account quotas and billing settings.
3. Export your local music as JSON. A hosted origin starts with separate browser storage; import the backup there. Hosting does not upload or synchronize local storage.
4. Run tests, both build commands and the release audit. Inspect the screenshot and file manifests.
5. Once publication is approved, install the Firebase CLI, sign in and explicitly choose the intended project. Never commit sign-in state, service-account keys, tokens or `.firebaserc`.

## Planned commands — not run yet

After account/project selection and approval:

```sh
npm run build
firebase emulators:start --only hosting --project YOUR_PROJECT_ID
```

Verify headers, samples, exports and reload behavior in the emulator. If approved, upload a short-lived preview:

```sh
firebase hosting:channel:deploy review --expires 1d --project YOUR_PROJECT_ID
```

A preview channel uploads files and creates an accessible URL; it is not an access-controlled private review space. Upload only the reviewed static app. Publish production after the preview is accepted:

```sh
firebase deploy --only hosting --project YOUR_PROJECT_ID
```

Verify HTTPS, keyboard use, audio, downloads, storage and headers on the actual site. Keep the prior Hosting version available for rollback. Add automated GitHub deployments only after the manual workflow and permissions are reviewed.

## Privacy distinction

The app has no analytics, tracking SDKs, remote fonts or remote audio. Saved music stays in the browser. A hosted copy still makes normal requests to Firebase/Google infrastructure, which handles request metadata under its policies. Do not describe hosting as involving no third-party network contact.

Cloud synchronization would require separate authentication, access rules, retention/deletion design and security review.

## Official references

- [Hosting quickstart](https://firebase.google.com/docs/hosting/quickstart)
- [Public directories and response headers](https://firebase.google.com/docs/hosting/full-config)
- [Preview and deployment workflow](https://firebase.google.com/docs/hosting/test-preview-deploy)

Approach checked against official documentation on September 6, 2026. Firebase emulator and cloud deployment checks remain pending.
