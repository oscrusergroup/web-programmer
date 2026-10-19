// Follow the latest commit on the upstream default branch at setup time.
const slug = "oscrusergroup/firmware";
export default {
  slug,
  repository: `https://github.com/${slug}.git`,
  ref: "HEAD",
  sketch: "Cart_Reader",
};
