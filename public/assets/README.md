# Static assets

Place dashboard assets in these folders:

- `images/` — ISP logo and other image files. Suggested logo path: `images/logo.svg` (or `.png`).
- `icons/` — SVG icons and favicon. The dashboard favicon is `icons/favicon.svg`.
- `fonts/` — self-hosted font files (`.woff2`, `.woff`).

Files under `public/assets/` are served from `/assets/`, for example:

- `public/assets/images/logo.svg` → `/assets/images/logo.svg`
- `public/assets/icons/favicon.svg` → `/assets/icons/favicon.svg`
- `public/assets/fonts/example.woff2` → `/assets/fonts/example.woff2`

Replace the favicon with the ISP's brand icon when the logo file is available.
