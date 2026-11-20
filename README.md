# Daily Apps

A static site of self-contained HTML apps, published with GitHub Pages (branch `main`, folder `/docs`).

## Layout

- `src/<slug>.html`: each app's original single HTML file (not modified)
- `apps.json`: one entry per app (metadata for the landing page, search and social previews)
- `site.json`: site name, tagline, `base_url` and optional `custom_domain`
- `build.py`: generates everything in `docs/` (don't edit `docs/` by hand)

## Adding an app

1. Save the app as `src/<slug>.html` (slug: lowercase letters, digits and hyphens, e.g. `phasor`).
2. Add an entry to `apps.json`:

```json
{
  "slug": "phasor",
  "name": "PHASOR",
  "tagline": "One line saying what it does, in words people would search for",
  "meta_description": "Optional, 140–160 characters for Google's snippet; defaults to the tagline",
  "category": "Engineering",
  "keywords": ["phasor diagram", "ac circuit calculator"],
  "date": "2026-11-21",
  "accent": "#3cf0a8",
  "description": "150–300 words of plain text: what it is, who it's for, what you can do with it.\n\nSeparate paragraphs with a blank line.",
  "how_to": ["Step one", "Step two", "Step three"]
}
```

3. Run `python3 build.py`, then commit and push. The site updates in about a minute.

## Using a custom domain

Set `custom_domain` (e.g. `apps.example.com`) and change `base_url` to `https://apps.example.com` in `site.json`, rebuild and push. Then add the DNS record GitHub shows under Settings → Pages.
