# Lost in Translation

Offline HTML presentation.

Open `index.html` in Chrome or Edge. Use `F` for fullscreen, right arrow/space to advance, and left arrow to go back.

For reliable local serving:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

The presentation targets PPMonument and falls back to Inter/Arial if PPMonument is not installed. Place licensed PPMonument webfont files in `assets/fonts/` and add `@font-face` declarations in `styles.css` for an embedded build.
