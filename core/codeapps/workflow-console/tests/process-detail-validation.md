# Process Detail Validation

## Custom API Integration (2026-09-10)

- Final checks: 19 Node tests passed; production build passed with the existing
  bundle-size warning; focused ESLint check of the feature and fixtures passed.
- Header and timeline now come from GetProcess; the parser preserves server order
  and validates identity, timeline shape and duplicate step IDs.
- Per user clarification, all three metadata lists load immediately. On the fixture's
  untouched Timeline tab the counts are Attachments 26, Artifacts 5, Outputs 7,
  including unlinked records. Initial calls are exactly GetProcess, GetAttachments,
  GetArtifacts and GetOutputs; no row-content reads or file downloads occur.
- Expanding a step still produces no content reads. Expanding `order.details` reads
  only `output:nested`; expanding the JSON artifact adds `artifact:json` and one file
  download. JSON content renders through the existing viewer.
- Verified isolated list, output and file errors with successful Retry, plus empty
  collections, a denied detail request and malformed timeline JSON. Step-level error
  details are absent from the API DTO; process-level errors are retained.
- Authenticated Dev page rendered Timeline 2, Attachments 1, Artifacts 0, Outputs 1
  while Timeline remained selected. A live output expanded successfully with no page
  alert. Nonempty artifacts/file downloads were exercised in the fixture, not Dev.
- Temporary live SDK tracing wrappers were restored. Hidden-player click stability
  and hot-reload module identity made the initial tracing attempts inconclusive;
  fixture counters establish request isolation, while the live UI check establishes
  authenticated rendering. No app deployment, API publish or business-data write.

Historical results below describe the earlier table-query implementation.

Validated on 2026-09-07 against the local Vite server on port 3000.

## Automated Checks

| Check | Result | Exit Code |
| --- | --- | --- |
| `npm test` | 8 tests passed | 0 |
| `npm run lint` | Passed | 0 |
| `npm run build` | Passed; bundle-size warning | 0 |
| Editor diagnostics for the changed feature | No errors | N/A |

The Node tests cover all-page collection, duplicate IDs, page errors, repeated tokens,
chronological ordering, direct step ownership, durations, safe file classification,
URL validation and preservation of false/zero/empty/JSON output values.

## Browser Checks

The development-only `/tests/process-detail.html` fixture renders the real process
detail components with mocked generated services. It is not a production entry point
and makes no Dataverse writes. Add `?empty`, `?error`, or `?dark` to select test states.

Verified with the integrated Playwright browser:

- Timeline selected by default; all four resource tabs remain present.
- Completed and Waiting human steps preserve their recorded statuses; no task table.
- Expanded artifacts/outputs belong to their direct step; unlinked records remain in tabs.
- All 26 attachments are accessible across two mocked service pages.
- JSON and Markdown load on expansion; JSON renders recursive fields and Markdown renders safely.
- PDF and Word artifacts do not auto-download or create iframe/image/object previews.
- Expansion survives tab switching; keyboard Enter expands and collapses a step.
- Failed-step error details, empty collections, isolated collection errors and Retry work.
- Desktop (1440 x 1000) and mobile (390 x 844) checks show no page-width overflow;
  light and dark screenshots were inspected.

The explicit PDF download button invoked the mock binary service without an application
error. The integrated browser did not emit a download-completed event, so browser-save
completion is unverified. The first immediate error-disclosure assertion also timed out;
a subsequent direct click verified the rendered error, and keyboard disclosure checks passed.

## Remaining Gaps

The authenticated Power Apps tabs either retained the old placeholder build or showed a
blank host after reload. Live Dataverse query/file access against this new build could
not be verified through those tabs. External file CORS/authentication, actual binary
save completion and live task-submission invalidation remain unverified.

Overall: local build, lint, unit and fixture UI checks pass; live integration requires
verification in a fresh Power Apps local-player session. The code app has not been deployed.

## Structured Content Follow-up (2026-09-07)

- Distinct gear, person and bot icons verified for Automated, Human Task and AI steps,
  independently of completion status. Status badges are retained.
- Fixture now contains five steps and seven outputs, including nested JSON, Markdown
  and malformed JSON. Recursive objects/arrays preserve zero, false, null and empty containers.
- JSON source matches the original stored string. Markdown renders headings, bold text
  and GFM tables; source and downloadable Blob content match exactly.
- Raw HTML is disabled in rendered Markdown but preserved literally in source. Unsafe
  links do not render as anchors, and Markdown images do not render or fetch.
- Malformed JSON falls back to source. Process-wide Outputs and inline step outputs
  use the same renderer. File preview downloads included only JSON and Markdown.
- Desktop screenshot reviewed at 1440 x 1000 with no horizontal overflow. Mobile
  validation was explicitly excluded by the user for this follow-up.
- Build, lint and all eight regression tests passed after the changes. The build retains
  a bundle-size warning (821.89 kB JavaScript before gzip).
- With explicit approval, the dev environment now includes Markdown datatype 324010006,
  and mail-order-intake's Complete validation step is published as Automated. Runtime
  and designer values were read back and synchronized into solution source at 1.3.0.1.
- Solution pack passed. Solution Checker reported zero Critical, High, Medium, Low
  and Informational findings. No business-data flow run or historical-row rewrite was performed.

Remaining: authenticated live-app rendering and actual browser file-save completion
are not established by these fixture/Blob checks.