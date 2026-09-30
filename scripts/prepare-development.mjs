if (process.env.FIRMWARE_BACKEND !== "cloudflare" && process.env.WORKERS_CI !== "1") {
  const { setupFirmware } = await import("./setup-firmware.mjs");
  await setupFirmware();
}
