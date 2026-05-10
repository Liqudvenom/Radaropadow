# Earth textures

This directory is **served as `/textures/...`** by Vite. To use your own
NASA-grade equirectangular textures instead of the default CDN set, set
`VITE_EARTH_TEXTURE_BASE=/textures` in `.env` and drop files here using
the names below.

## Convention

All maps are **equirectangular projection, 2:1 aspect ratio** (e.g.
2048×1024, 4096×2048). Renders or hemisphere shots **will not work**
— they are not equirectangular and will distort heavily at the poles.

| Filename                     | Layer       | Purpose                                            |
|------------------------------|-------------|----------------------------------------------------|
| `earth_day.jpg`              | albedo      | Daytime base (Blue Marble / VIIRS)                 |
| `earth_night.jpg`            | emissive    | City lights, sampled when terminator is on the dark side |
| `earth_clouds.png`           | overlay     | Cloud cover with transparency (PNG)                |
| `earth_normal.jpg`           | normal      | Surface normals — adds relief shading              |
| `earth_specular.jpg`         | specular    | Ocean / land mask for water glint                  |
| `earth_dem.jpg`              | heightmap   | Optional, used by line-art mode for contour lines  |

## Recommended public sources

- **Blue Marble (day)** — https://visibleearth.nasa.gov/collection/1484/blue-marble
- **Earth at night (Black Marble 2016)** — https://earthobservatory.nasa.gov/features/NightLights
- **Cloud composite + DEM + normal** — https://www.solarsystemscope.com/textures/ (CC BY 4.0)
- **three.js example set (default)** — https://github.com/mrdoob/three.js/tree/master/examples/textures/planets

If a file is missing here, the renderer falls back gracefully:
- missing `night` → uniform dark side
- missing `clouds` → no cloud layer
- missing `normal` → flat shading
- missing `specular` → uniform shininess
- missing `dem` → procedural fBm contours in line-art mode
