# GitHub release checklist

Prepared for review, **not yet published**.

1. Run unit/browser/HTTP checks and inspect the UI.
2. Run `npm run build`, `npm run release:candidate`, then `npm run audit:release`.
3. Review `release/github-source/` and its manifest. Do not upload the whole working folder.
4. Confirm the screenshot shows demonstration music only and the candidate contains no personal exports, logs, home paths, credentials or old snapshots.
5. Choose an explicit source-code license. Retain CC-BY attribution, source notes and font OFL notices.
6. Choose repository name, owner and visibility; enable available secret scanning/push protection and private vulnerability reporting.
7. After publication approval, create the repository and push only reviewed files. Inspect the remote file list and rendered README.
8. Follow `FIREBASE_PLAN.md` separately. Delay automated deployments until manual preview/production verification passes.

Build/audit commands create no repository, commit, push, ZIP, Firebase login or deployment.
