# Cartridge Lab

A Next.js + Tailwind CSS web programmer for the Open Source Cartridge Reader firmware in `arduino-code/Cart_Reader`. Visitors choose their hardware and firmware options, compile on the server, then upload to their Arduino Mega 2560 through Web Serial.

## Run locally

Requires Node.js 22 or newer. From this folder:

```sh
npm ci
npm run setup:arduino
npm run dev
```

Open http://localhost:3000 in desktop Chrome or Edge. The one-time setup installs Arduino CLI 1.3.1, the AVR core 1.8.6 and pinned libraries into `.tools/` and `.arduino/`. It verifies the CLI archive checksum and does not use a global Arduino installation. macOS uses the AVR compiler supplied by Arduino, which may require Rosetta on Apple Silicon. Windows needs `tar` on PATH (included in current Windows).

The interface still works before compiler setup, but building is disabled with setup instructions. `npm run dev` and `npm run build` use the supported Webpack bundler for predictable operation in environments with restricted Turbopack worker sockets.

## Program a reader

1. Choose the physical HW1–HW5 revision or serial monitor hardware mode.
2. Enable installed modules and select the game systems you need.
3. Adjust firmware options and click **Build firmware**.
4. Connect the Mega 2560 with a USB data cable and close other applications using the serial port.
5. Click **Connect**, choose the USB serial device, then **Upload to Arduino**.
6. Keep the cable connected through writing and readback verification. The board restarts when finished.

`Config.h` and compiled application `.hex` files can also be downloaded. Editing any setting invalidates the previous build. Browser permission is requested from the Connect button. USB serial adapters on clone boards are supported without restricting vendor IDs; the uploader checks the ATmega2560 device signature before writing.

## How configuration works

`src/lib/config.ts` reads option groups, labels, descriptions, defaults and editable define locations directly from the bundled `Config.h`. Block-comment examples are excluded. The Processing section is preserved, and the original sketch is never changed by a build.

Validation requires one hardware revision, validates LCD channels in the firmware's **green, red, blue** order, handles RTC selection, and checks SNES/N64/flash/clock dependencies. VSELECT is restricted to HW3/HW5, matching the firmware's safe configurations. Warnings explain settings the firmware ignores or overrides. All configurable defines above Processing are represented in the interface. The default configuration has no hardware selection, so visitors must make that choice.

Builds copy the sketch to a temporary directory and invoke Arduino CLI with an argument array and a fixed `arduino:avr:mega:cpu=atmega2560` target. The API accepts only a complete allowlisted configuration, caps request bodies at 16 KiB, permits one compiler job per Node process, limits execution to four minutes, and cleans temporary files. Compiler output and actual flash/RAM usage are returned to the UI. No source code, shell arguments, paths or board targets are accepted from visitors.

`src/lib/serial/` implements Intel HEX validation and the stock Mega 2560 STK500v2 bootloader flow at 115200 baud: reset, signature check, page programming, complete readback and restart. It validates checksums, response sequences and the 248 KiB application boundary. Bootloader and EEPROM are not modified. Protocol commands follow [Arduino's bootloader source](https://github.com/arduino/ArduinoCore-avr/tree/master/bootloaders/stk500v2); Web Serial behavior follows [Chrome's documentation](https://developer.chrome.com/docs/capabilities/serial).

## Host the website

Use a persistent Linux Node server or container with HTTPS. This application needs a writable temporary directory and permission to execute the AVR compiler. A static host or an Edge runtime cannot run this compiler.

```sh
npm ci
npm run setup:arduino
npm run build
APP_ORIGIN=https://reader.example.com npm start
```

Or build the provided container (Linux amd64 is recommended for the AVR toolchain):

```sh
docker build --platform linux/amd64 -t cartreader-programmer .
docker run --rm -p 3000:3000 -e APP_ORIGIN=https://reader.example.com cartreader-programmer
```

Terminate TLS at your hosting provider or reverse proxy. Set `APP_ORIGIN` to its exact public origin, preserve the incoming Host header, and allow at least 300 seconds for `/api/build`. Web Serial requires HTTPS, with localhost permitted for development. The compiler runs on the host; each visitor's USB device remains in their own browser. No USB passthrough is needed on the server.

For a public installation, configure request rate limits on `/api/build` at the proxy and cap container CPU/memory. The application's concurrency limit is per process; run one Node worker per container. There is no account system or shared job queue. A busy compiler returns an actionable retry message. Do not expose development mode publicly.

## Verify

```sh
npm test
npm run typecheck
npm run build
```

Tests cover actual Config.h parsing and generation, invalid inputs, request boundaries, Intel HEX corruption and bootloader protection, simulated flash uploads across 128 KiB, wrong MCU detection and readback failure. The real HW5 default firmware has been compiled locally. A physical USB upload requires acceptance testing with a connected Mega 2560; simulated protocol tests cannot verify USB drivers, reset timing or a particular board's bootloader.

The supplied firmware retains its GPL-3.0 licensing in `arduino-code/LICENSE`. See `docs/implementation.md` for the implementation notes.
