# Cartridge Lab

A Next.js + Tailwind CSS web programmer for the Open Source Cartridge Reader firmware from [sanni/cartreader](https://github.com/sanni/cartreader/). Visitors choose their hardware and firmware options, compile on the server, then upload to their Arduino Mega 2560 through Web Serial.

## Run locally

Requires Node.js 22 or newer, pnpm 12.6.0 and Git 2.25 or newer. The package manager version is pinned in `package.json`. If pnpm is not installed, run `corepack enable` and `corepack prepare pnpm@12.6.0 --activate`. From this folder:

```sh
pnpm install --frozen-lockfile
pnpm run setup:arduino
pnpm run dev
```

Open http://localhost:3000 in desktop Chrome or Edge. The one-time setup installs Arduino CLI 1.3.1, the AVR core 1.8.6 and pinned libraries into `.tools/` and `.arduino/`. It verifies the CLI archive checksum and does not use a global Arduino installation. macOS uses the AVR compiler supplied by Arduino, which may require Rosetta on Apple Silicon. Windows needs `tar` on PATH (included in current Windows).

The interface still works before compiler setup, but building is disabled with setup instructions. `pnpm run dev` and `pnpm run build` use the supported Webpack bundler for predictable operation in environments with restricted Turbopack worker sockets.

## Firmware repository reference

[`firmware-source.mjs`](firmware-source.mjs) records the repository URL and `HEAD`, which follows the latest commit on the upstream default branch. Firmware source is fetched as a dependency; it is not tracked in this application's repository.

`pnpm run dev`, `pnpm run build`, and `pnpm test` automatically run `setup:firmware`. Every setup run fetches the latest remote `HEAD` into the ignored `.firmware-cache/cartreader/` directory, checking out the `Cart_Reader` sketch, README and license. Network access is required; an update check failure stops setup instead of silently using stale firmware. To fetch it explicitly:

```sh
pnpm run setup:firmware
```

The configuration form defaults to this latest checkout. Visitors can also select a published GitHub release; its tag is downloaded on demand into a separate cache. The release list is cached for five minutes, and prereleases are labeled. Switching versions resets the configuration and clears the previous binary. Older releases with incompatible Config.h formats show an explanatory error. Other older releases may require library versions different from the bundled toolchain. To update the firmware, run setup again, then test and restart or rebuild the application. A running server uses the downloaded checkout until the next setup or deployment. `FIRMWARE_CACHE_DIR` can relocate the cache; use the same setting for setup, build and runtime. Docker fetches the latest source during its build and includes the populated cache and Git in the runtime image. Release selection needs outbound HTTPS to GitHub and a writable firmware cache at runtime.

Each loaded version gets an immutable sketch snapshot under `.firmware-cache/build-sources/`. Build requests include that snapshot’s revision, so a visitor’s configuration and compilation always use the same source even if another visitor selects a different release. This records the source for each build; the latest channel continues to follow upstream HEAD on setup.

## Program a reader

1. Choose **Latest repository code** or a published release in **Firmware source**, then select the physical HW1–HW5 revision or serial monitor hardware mode.
2. Enable installed modules and select the game systems you need.
3. Adjust firmware options and click **Build firmware**.
4. Connect the Mega 2560 with a USB data cable and close other applications using the serial port.
5. Click **Connect**, choose the USB serial device, then **Upload to Arduino**.
6. Keep the cable connected through writing and readback verification. The board restarts when finished.

`Config.h` and compiled application `.hex` files can also be downloaded. Editing any setting invalidates the previous build. Browser permission is requested from the Connect button. USB serial adapters on clone boards are supported without restricting vendor IDs; the uploader checks the ATmega2560 device signature before writing.

## How configuration works

`src/lib/config.ts` reads option groups, labels, descriptions, defaults and editable define locations directly from the referenced firmware’s `Config.h`. Block-comment examples are excluded. The Processing section is preserved, and the original sketch is never changed by a build.

Validation requires one hardware revision, validates LCD channels in the firmware's **green, red, blue** order, handles RTC selection, and checks SNES/N64/flash/clock dependencies. VSELECT is restricted to HW3/HW5, matching the firmware's safe configurations. Warnings explain settings the firmware ignores or overrides. All configurable defines above Processing are represented in the interface. The default configuration has no hardware selection, so visitors must make that choice.

Builds copy the sketch to a temporary directory and invoke Arduino CLI with an argument array and a fixed `arduino:avr:mega:cpu=atmega2560` target. The API accepts a prepared source revision and a complete allowlisted configuration, caps request bodies at 16 KiB, serializes compiler jobs per Node process and shares equivalent pending builds, limits execution to four minutes, and cleans temporary files. Compiler output and actual flash/RAM usage are returned to the UI. No source code, shell arguments, paths or board targets are accepted from visitors.

`src/lib/serial/` implements Intel HEX validation and the stock Mega 2560 STK500v2 bootloader flow at 115200 baud: reset, signature check, page programming, complete readback and restart. It validates checksums, response sequences and the 248 KiB application boundary. Bootloader and EEPROM are not modified. Protocol commands follow [Arduino's bootloader source](https://github.com/arduino/ArduinoCore-avr/tree/master/bootloaders/stk500v2); Web Serial behavior follows [Chrome's documentation](https://developer.chrome.com/docs/capabilities/serial).

## Deploy on Cloudflare

The website runs on Cloudflare Workers. Cache misses compile on demand in Cloudflare Containers, coordinated by a Durable Object. Successful firmware builds are stored in R2 and reused across future visitors. Matching builds return without starting the compiler. The cache key includes the firmware commit, generated Config.h and the complete toolchain, so changed source or settings cannot return an older binary.

With Docker running and a Workers Paid account with R2 and Containers enabled:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm run cf:bucket
pnpm run cf:deploy
```

Create the bucket once; subsequent deploys reuse it. See [Cloudflare deployment instructions](docs/cloudflare.md) for bindings, GitHub token setup, preview commands, cache behavior and verification limits. Local Node development also caches successful builds under `.firmware-cache/builds/`.

For a Git-connected Cloudflare build, set **Build command** to `pnpm run cf:build` and **Deploy command** to `pnpm run cf:deploy:firmware && pnpm run cf:deploy:web`. Enable Workers Paid and R2 and create the cache bucket first. The default `pnpm run build` does not generate the OpenNext bundle required by Cloudflare; see [Workers Builds setup](docs/cloudflare.md#deploy-from-a-connected-git-repository).

## Host on a persistent Node server

Use a persistent Linux Node server or container with HTTPS. This application needs a writable temporary directory and permission to execute the AVR compiler. A static host or an Edge runtime cannot run this compiler.

```sh
pnpm install --frozen-lockfile
pnpm run setup:arduino
pnpm run build
APP_ORIGIN=https://reader.example.com pnpm start
```

Or build the provided container (Linux amd64 is recommended for the AVR toolchain):

```sh
docker build --no-cache --platform linux/amd64 -t cartreader-programmer .
docker run --rm -p 3000:3000 -e APP_ORIGIN=https://reader.example.com cartreader-programmer
```

Use `--no-cache` when building the container so Docker reruns the upstream firmware check.

Terminate TLS at your hosting provider or reverse proxy. Set `APP_ORIGIN` to its exact public origin, preserve the incoming Host header, and allow at least 300 seconds for `/api/build`. Web Serial requires HTTPS, with localhost permitted for development. The compiler runs on the host; each visitor's USB device remains in their own browser. No USB passthrough is needed on the server.

For a public installation, configure request rate limits on `/api/build` and `/api/firmware` at the proxy and cap container CPU/memory. The application's concurrency limit is per process; run one Node worker per container. There is no account system; each Node process has its own bounded build queue. A busy compiler returns an actionable retry message. Do not expose development mode publicly.

## Verify

```sh
pnpm test
pnpm run typecheck
pnpm run build
```

Tests cover release discovery and errors, separate version snapshots, source revision validation, following upstream updates, preserving local cache edits, failed update checks, actual Config.h parsing and generation, invalid inputs, request boundaries, Intel HEX corruption and bootloader protection, simulated flash uploads across 128 KiB, wrong MCU detection and readback failure. The latest firmware and release V15.5 have both been compiled locally for HW5. A physical USB upload requires acceptance testing with a connected Mega 2560; simulated protocol tests cannot verify USB drivers, reset timing or a particular board's bootloader.

The referenced firmware retains its [upstream GPL-3.0 license](https://github.com/sanni/cartreader/blob/HEAD/LICENSE), also fetched into the firmware cache. See `docs/implementation.md` for the implementation notes.
