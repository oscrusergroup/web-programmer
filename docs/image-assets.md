# Hardware preview assets

The firmware summary uses a preview for each hardware selection. Hardware 5 is also the default before a selection is made.

| Selection | Asset | Dimensions | Source |
| --- | --- | --- | --- |
| Hardware 1 | `public/images/hardware-1.webp` | 500 × 482 | User-provided image |
| Hardware 2 | `public/images/hardware-2.webp` | 1448 × 1086 | User-provided image, built-in image_gen cutout |
| Hardware 3 | `public/images/hardware-3.webp` | 640 × 499 | User-provided image |
| Hardware 4 | `public/images/hardware-4.webp` | 1437 × 1095 | User-provided image, built-in image_gen cutout |
| Hardware 5 | `public/images/hardware-5.webp` | 1437 × 1095 | User-provided image, built-in image_gen cutout |
| Serial Monitor | `public/images/serial-monitor.webp` | 1448 × 1086 | Built-in image_gen tool |

Hardware 1 and 2 were recovered from the attached image data in this chat after their temporary files expired. The generated Serial Monitor asset depicts a PC and terminal; screen text is illustrative.

All six published previews are lossless WebP files with an alpha channel. Hardware 1 and 3 already had transparent backgrounds and were converted directly. The remaining four were edited with the built-in image_gen tool in background-extraction mode, then converted using `cwebp -lossless`. Original PNGs are retained in `docs/source-images/` for reference and are not served by the website. AI cutouts can differ in small rendered details from their originals.

The sidebar uses a fixed 4:3 preview frame and `object-contain`, with padding so the complete object stays visible. The hardware selection hint also reserves a line of space.

## Background extraction prompt set

The following prompt was used separately for `hardware-2`, `hardware-4`, `hardware-5`, and `serial-monitor`, substituting the asset name for `[asset]`. Each call used its original PNG as the edit target and `transparent_background: true`.

Use case: background-extraction. Input image: edit target, [asset]. Primary request: remove only the background and create an actual transparent cutout for a website preview. Preserve the complete existing object, its exact shape, perspective, proportions, original colors, shading, outlines, all components and all printed lettering and terminal text. Remove the backdrop outside the object and in visible gaps between parts. Keep dark object surfaces opaque. Do not redraw, redesign, add or remove parts, crop, recolor, change lettering, or add shadows, glow, checkerboard or any backdrop. Keep the original composition and framing.

## Serial Monitor generation prompt

Use case: stylized-concept. Asset type: hardware preview image for a cartridge-reader firmware programmer website. Primary request: an image of a desktop PC with a terminal on its screen, representing Serial Monitor mode. Style: clean isometric CAD-style 3D technical illustration with crisp outlined edges, matching schematic hardware product renders. Show a complete desktop monitor, compact PC tower and keyboard as one centered arrangement viewed from a slightly elevated three-quarter angle. Dark graphite equipment with subtle gray edge highlights; monitor displays a clearly recognizable black terminal window with a few simple lines of green monospace text and a green command prompt. Plain neutral charcoal background, no blue cast. Landscape 4:3 framing with modest margins; all computer parts fully visible without cropping. No people, no Arduino board, no brand logos, no decorative objects, no watermark.


# Display comparison photos

The info modal on the "New OSCR rotary display" option compares the two HW5 displays sold by cartreader.net.

| Display | Asset | Dimensions | Source |
| --- | --- | --- | --- |
| New OSCR rotary display | `public/images/display-new-oscr.webp` | 750 × 1000 | User-provided photo |
| Regular display | `public/images/display-regular.webp` | 750 × 1000 | User-provided photo |

These are photos, so they were downscaled from 1500 × 2000 and converted with lossy `cwebp -q 82` rather than losslessly. Originals are in `docs/source-images/`.
