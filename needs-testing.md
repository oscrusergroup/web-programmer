# Needs testing: unsupported browser modal

Status as of 2026-10-29. The modal is in `src/components/unsupported-browser-dialog.tsx` and shows when `serialSupported()` is false.

## Still to test

### Firmware upload in Firefox

Firefox 159 has every Web Serial method the uploader calls, but no upload has been tried with a real Arduino.

- [ ] Connect a Mega 2560 from desktop Firefox and confirm the port picker appears.
- [ ] Upload firmware through to readback verification and restart.
- [ ] Use the serial monitor to read output and send a command.
- [ ] Use the OSCR clock settings.

If these pass, add Firefox to the "Chrome or Edge" messages in the modal, `programmer.tsx`, `serial-monitor.tsx`, `clock-settings.tsx` and `README.md`, and add a **Get Firefox** link to the modal.

### Modal over plain HTTP

Under `next dev` on a LAN address, the page did not hydrate, so the modal never opened. This is probably a dev-server restriction, but that is unconfirmed.

- [ ] Run a production build on a non-`localhost` HTTP address and confirm the modal opens and stays open.
- [ ] If the page still fails to hydrate, find out why, since nothing interactive would work there either.

### Safari

Safari 27.2 was tested on a Mac with AppleScript and window screenshots. WebDriver was not used because "Allow remote automation" is off.

- [ ] On `/serial-monitor`, try Escape and clicking outside the modal. Only `/` was tested for this.
- [ ] Open the modal on Safari for iOS and confirm it fits the screen. The **Get Chrome** and **Get Edge** links do not help on iOS, because the modal asks for a desktop browser.

### Browsers with unclear support

Sources conflict or say nothing for these, so check what they actually do.

- [ ] Chrome for Android: does `navigator.serial` exist? One source says it shipped in Chrome 148, another says it is unsupported.
- [ ] Android back gesture: if the modal shows there, confirm it reopens after a back gesture.
- [ ] Samsung Internet and Opera Mobile.
- [ ] Firefox for Android.

### Older and untested desktop browsers

- [ ] Firefox before 151: the modal should show.
- [ ] Real Chrome, Edge and Opera on desktop: the modal should stay hidden. Only Playwright's Chromium has been tested.
- [ ] Firefox Developer Edition 160: forced modal test. Only the normal case, where the modal stays hidden, was tested.

## Already tested

- Chromium with Web Serial removed: the modal stayed open on `/` and `/serial-monitor` through Escape twice, an outside click and a scripted `close()`.
- Firefox 159 with `dom.webserial.enabled` off: the same result on both pages.
- Firefox 159 and 160 as normal: the modal stays hidden on both pages.
- Safari 27.2: the modal shows on both pages, and stayed open on `/` through three Escape presses and an outside click.

## Open decision

The modal blocks the whole app, so unsupported browsers cannot configure firmware or reach the **Download SD card files** link. Decide whether to add that link to the modal.
