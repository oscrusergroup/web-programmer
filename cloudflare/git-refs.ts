import { FirmwareError } from "../src/lib/errors";

// Smart HTTP discovery returns byte-counted pkt-lines, not plain text refs.
export function gitRevision(advertisement: ArrayBuffer, ref: string): string {
  const invalid = () => new FirmwareError("GitHub returned an invalid Git ref advertisement.", 502);
  const bytes = new Uint8Array(advertisement);
  if (bytes.length > 1_048_576) throw invalid();
  const decoder = new TextDecoder();
  const packets: (string | null)[] = [];
  for (let offset = 0; offset < bytes.length;) {
    const prefix = decoder.decode(bytes.subarray(offset, offset + 4));
    if (!/^[a-f0-9]{4}$/.test(prefix)) throw invalid();
    const length = parseInt(prefix, 16);
    if (length === 0) {
      packets.push(null);
      offset += 4;
    } else {
      if (length < 4 || length > 65_520 || offset + length > bytes.length) throw invalid();
      packets.push(decoder.decode(bytes.subarray(offset + 4, offset + length)));
      offset += length;
    }
  }
  if (packets[0]?.replace(/\n$/, "") !== "# service=git-upload-pack" ||
      packets[1] !== null || packets.length < 4 || packets.at(-1) !== null) throw invalid();
  const refs = new Map<string, string>();
  for (const packet of packets.slice(2, -1)) {
    const record = packet?.match(/^([a-f0-9]{40}) ([^\0\n]+)(?:\0[^\n]*)?\n?$/);
    if (!record) throw invalid();
    refs.set(record[2], record[1]);
  }
  // Annotated tags advertise a tag object plus its peeled commit. Raw files
  // and build cache keys must use the commit, not the tag object's hash.
  const revision = refs.get(`${ref}^{}`) ?? refs.get(ref);
  if (!revision || /^0{40}$/.test(revision)) throw invalid();
  return revision;
}
