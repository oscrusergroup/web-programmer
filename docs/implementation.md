# Cartridge Reader web programmer

The user requested Next.js and Tailwind CSS, with server compilation and browser USB upload for visitors to a hosted website.

## Design

Use Config.h from the selected latest default-branch checkout or published release as the source for option labels, descriptions, groups, defaults and output. Parse only the editable area, ignoring defines inside explanatory comments and preserving the Processing section. Require an explicit hardware choice. Validate hardware constraints and core dependencies before compilation.

Next.js runs as a persistent Node service with Arduino CLI and pinned AVR libraries. POST /api/build accepts only a small, validated configuration object; it copies the sketch into a temporary directory and compiles the Mega 2560 target without invoking a shell. Limit concurrent builds and execution duration and always remove temporary files. Return the application-only Intel HEX, diagnostics and a configuration fingerprint. The browser invalidates a build when settings change.

Use Web Serial and the Mega bootloader's STK500v2 commands for reset, signature check, flash write, readback verification and leave programming mode. Check HEX checksums and application address limits before opening the device. Never write bootloader or EEPROM. Test a simulated bootloader including addresses above 128 KiB, corrupted replies, timeouts and verification failures. Physical upload remains a hardware acceptance test.

Interface: slate background #f4f7fb, white panels #ffffff, navy text #172b4d, cobalt actions #345cf0, muted blue #eaf0ff and green #17765e. System sans typography, monospace for compiler output. A three-stage configuration area sits beside a sticky device and build panel. Responsive layout, accessible inputs and status messages, searchable cores and downloadable Config.h/HEX.

## Implementation plan

- [x] Parse Config.h and enforce selection/dependency rules; test preservation and hostile input.
- [x] Add CLI setup, bounded compilation endpoint and deployment container; compile the real sketch.
- [x] Add Intel HEX validation and STK500v2 uploader; test against a protocol simulator.
- [x] Build responsive configuration UI with build, connection, upload, download and diagnostic states.
- [x] Run automated tests, type checking, production build and browser interaction checks. Document setup and deployment.

## Verification focus

No hardware selection, conflicting dependent options, numeric injection, compilation failures/timeouts, stale binaries after edits, unsupported browsers, cancelled port picker, disconnected/busy ports, partial serial packets, extended flash addresses and failed readback must produce actionable outcomes.

## Verified result

20 automated tests pass, TypeScript checks pass, and the Next.js production build succeeds. Browser checks cover hardware selection, searching cores, dependency validation, invalid numeric input, firmware invalidation, real server compilation and a 390px layout without horizontal overflow. HW5 with the original six cores compiles to 181,796 bytes of flash and 5,234 bytes of RAM. Physical USB upload and a Docker build remain unverified because no board was selected for flashing and Docker is unavailable in this environment.

## Firmware source dependency

The application references https://github.com/sanni/cartreader.git using remote HEAD. Each setup run fetches the latest default-branch commit and downloads the sketch and license into the ignored .firmware-cache/cartreader cache, and both configuration parsing and compilation use that path. Development, production builds, and tests refresh the cache automatically and require network access. Failed update checks stop setup; local cache edits are preserved and reported. The previous embedded firmware checkout was removed from the application Git index and preserved as an ignored cache.

## Firmware version selection

The source selector defaults to latest repository code and lists published GitHub releases (including labeled prereleases). Changing versions loads that version’s Config.h, resets defaults, and invalidates the built binary. GitHub failures offer retry while latest remains usable. Unsupported older Config.h formats are reported explicitly.

Release downloads run asynchronously with at most two source preparations per process. Published tags are allowlisted through the GitHub release list; arbitrary visitor refs and URLs are rejected. Releases have separate caches. Prepared sketches are stored by resolved commit in build-sources, and the build API requires that existing snapshot’s revision. Both configuration validation and compilation use the snapshot, protecting each visitor from cross-version changes. The latest checkout still refreshes on setup without a fixed revision in application configuration.

Runtime needs Git, outbound GitHub access and a writable firmware cache. Docker includes Git. Release V15.5 compiled successfully for HW5 to 181,784 bytes flash and 5,234 bytes RAM. This verifies one release against the bundled libraries, not every historical release.
