# GitHub release checklist

Use this checklist for updates to the public [Guitar Lesson Studio repository](https://github.com/FreshPremise/guitar-lesson-studio).

1. Run unit/browser/HTTP checks and inspect the UI.
2. Run `npm run build`, `npm run release:candidate`, then `npm run audit:release`.
3. Review `release/github-source/` and its manifest. Do not upload the whole working folder.
4. Confirm the screenshot shows demonstration music only and the candidate contains no personal exports, logs, home paths, credentials or old snapshots.
5. A source-code reuse license is an owner decision and has not been selected. Retain CC-BY attribution, source notes and font OFL notices.
6. Verify repository owner, name and visibility. Review available secret scanning, push protection and private vulnerability reporting settings.
7. After publication approval, update the existing branch without rewriting its history. Push only reviewed files; verify remote hashes and the rendered README.
8. Follow `FIREBASE_PLAN.md` separately. Delay automated deployments until manual preview/production verification passes.

Build/audit commands create no repository, commit, push, ZIP, Firebase login or deployment.
