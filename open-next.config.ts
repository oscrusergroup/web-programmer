import { defineCloudflareConfig } from "@opennextjs/cloudflare";
// The app renders dynamically; firmware artifacts use the separate BUILD_CACHE R2 bucket.
export default defineCloudflareConfig();
