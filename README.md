# Miles Caton (site 2)

Fan site for Miles Caton. Black, lowercase, Helvetica, with his signature on a live TV-static hero. Every word, photo, link, video, date and award is editable at `/admin` (Decap CMS). Same kit as the first Miles Caton site and happy's: content in `/content`, one build script, no site generator.

## How it's laid out

| Folder | What's in it |
|---|---|
| `content/` | One JSON file per page plus `site.json`. This is what the editor changes |
| `templates/` | Page templates (Nunjucks), with `layouts/` and `partials/` |
| `assets/` | CSS, JavaScript, icons, and `hero-tv.jpg` (the black-and-white photo inside the TV static) |
| `img/` | Photos. CMS uploads land in `img/uploads/` |
| `admin/` | The editor (`config.yml` defines every field) |
| `scripts/build.mjs` | Reads `content/`, renders `templates/`, resizes photos to AVIF/WebP/JPEG, writes `dist/` |
| `scripts/check.mjs` | Runs after every build: titles, descriptions, one h1 per page, alt text, broken links, glyphs phones turn into emoji, form setup, share image, Draft & Logic credit |

## Pages

| URL | What's on it |
|---|---|
| `/` | TV hero (photo shows through the static around the cursor, signature writes itself on), latest release, listen/follow links, bio, photo strip, City of Noise, page list, sign-off |
| `/story/` | Career year by year, with the year pinned on the left |
| `/sinners/` | Credits, premiere photos, the numbers, his five songs in the film |
| `/music/` | Every single, stacked full-screen. Each one plays in the on-site player |
| `/videos/` | Wall of TV screens. YouTube videos play on the site; others link out |
| `/photos/` | Photo grid with a full-screen viewer (arrow keys and swipe) |
| `/dates/` | Upcoming appearances, birthday countdown, past appearances |
| `/honors/` | Win and nomination counts, every award |
| `/press/` | Cover story, then every article newest first, filterable by kind |
| `/fans/` | The fan wall and the submission form |

Every page ends with the email sign-up, the "Spotted something out of date?" form and the footer.

## Forms (Netlify Forms)

| Form | What it's for | Where it lands |
|---|---|---|
| `newsletter` | Email sign-up | Netlify → Forms → newsletter. Export as CSV into your email tool |
| `fan-submission` | Fan art, covers, clips, messages | Netlify → Forms → fan-submission. Copy approved ones into *Pages → Fans → The wall* in the editor |
| `correction` | Out-of-date info and photo credit/removal requests | Netlify → Forms → correction |

Turn on email notifications in Netlify → Forms → Form notifications.

## Put it online

1. **Netlify → Add new site → Import from Git →** `bkknerd/milescaton2`. Settings come from `netlify.toml` (`npm run build`, publish `dist`, Node 22). Deploy.
2. **Editor login:** GitHub → Settings → Developer settings → OAuth Apps → New OAuth App. Callback URL `https://api.netlify.com/auth/done`. Then Netlify → Site configuration → Access & security → OAuth → GitHub, paste the Client ID and secret. Editors need write access to the repo.
3. **Domain:** add it in Netlify (HTTPS is automatic). Then set *Site settings → Live site address* in the editor, and `site_url` / `display_url` in `admin/config.yml`.

## Editing

Go to `https://YOUR-SITE/admin/` and sign in with GitHub. Saving commits to GitHub; Netlify rebuilds in about a minute.

- **YouTube:** paste only the ID. `https://www.youtube.com/watch?v=TPvGrWa3iWA` → `TPvGrWa3iWA`. For a playlist, paste the part after `list=` into the playlist field.
- **Photos:** upload big originals; the build resizes them. The caption doubles as the alt text.
- **Dates:** add upcoming shows under *Upcoming*; when it passes, move it to *Past appearances*.

## Work on it locally

```bash
npm install
npm start      # builds, serves http://localhost:8080, rebuilds on save
npm run cms    # second terminal: edit at http://localhost:8080/admin/ without signing in
npm run check  # re-run the checks on dist/
```

## Photo rights

Most photos are press and agency images supplied for a fan tribute and are not licensed. Before launching publicly or submitting to awards sites, clear them with the photographers or his team, or swap them for press-kit images in the editor. Keep the repo private until then.
