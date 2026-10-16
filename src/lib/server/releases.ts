import firmwareSource from "../../../firmware-source.mjs";
import type { FirmwareRelease } from "../firmware";

// Only published GitHub releases become selectable refs; never accept arbitrary refs from visitors.
export async function fetchReleases(fetcher: typeof fetch = fetch): Promise<FirmwareRelease[]> {
  const releases: FirmwareRelease[] = [];
  for (let page = 1; page <= 10; page++) {
    const response = await fetcher(`https://api.github.com/repos/${firmwareSource.slug}/releases?per_page=100&page=${page}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "cartreader-web-programmer" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`GitHub could not list releases (${response.status}). Please try again shortly.`);
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("GitHub returned an invalid release list.");
    for (const release of data) {
      if (release.draft || typeof release.tag_name !== "string" ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(release.tag_name) || release.tag_name.includes("..")) continue;
      releases.push({
        id: `release:${release.tag_name}`, tag: release.tag_name,
        label: typeof release.name === "string" && release.name ? release.name : release.tag_name,
        prerelease: release.prerelease === true,
      });
    }
    if (data.length < 100) break;
  }
  return releases;
}

const state = globalThis as typeof globalThis & {
  cartreaderReleases?: { expires: number; promise: Promise<FirmwareRelease[]> };
};
export function getReleases() {
  if (!state.cartreaderReleases || Date.now() >= state.cartreaderReleases.expires) {
    const promise = fetchReleases().catch((error) => {
      state.cartreaderReleases = undefined;
      throw error;
    });
    state.cartreaderReleases = { expires: Date.now() + 5 * 60_000, promise };
  }
  return state.cartreaderReleases.promise;
}
