/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  env: { FIRMWARE_BACKEND: process.env.FIRMWARE_BACKEND || "local" },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Permissions-Policy", value: "serial=(self)" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};
export default config;

if (process.env.FIRMWARE_BACKEND === "cloudflare") {
  const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
}
