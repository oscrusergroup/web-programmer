# Follow-up issues

- [ ] **Issue 1 — Medium: partial presets can silently select the wrong RTC chip.**
  - Location: `src/lib/presets.ts`, `applyPreset()` and `repairExclusivity()`.
  - Cause: preset values are merged over firmware defaults before exclusivity is repaired. With the current default `DS3231: true`, a partial preset explicitly selecting `DS1307: true` leaves both enabled; repair then unconditionally disables DS1307.
  - Reproduction: apply `{ HW5: true, ENABLE_RTC: true, DS1307: true }` to the current firmware schema. The result contains `DS3231: true`, `DS1307: false`, and `skipped: 0`.
  - Impact: an imported preset can build firmware for a different RTC chip than requested, without warning.
  - Suggested fix: resolve mutually exclusive options with explicit preset selections taking precedence over inherited defaults. Define deterministic handling for explicitly conflicting selections and retain compatibility with complete presets and firmware rebasing.
  - Acceptance checks: add a regression test proving the partial DS1307 preset selects DS1307 and disables DS3231; retain tests for full presets, conflicting selections, hardware exclusivity, and rebasing across firmware schemas.
  - Status: documented only; intentionally not implemented in this task.
