if (process.env.FIRMWARE_BACKEND !== "cloudflare") {
  const { setupFirmware } = await import("./setup-firmware.mjs");
  await setupFirmware();
}
