# Lost in Translation

Offline HTML presentation.

Open `index.html` in Chrome or Edge. Use `F` for fullscreen, right arrow/space to advance through builds, and left arrow to go back. Use Shift + right/left arrow to jump directly between fully built scenes.

Press `P` from the audience presentation to open the synchronized Presenter View. Keep Presenter View on the laptop, move the audience window to the external display, and share only the audience window in Zoom or Google Meet. Navigation works from either window. Presenter View includes current and next scene previews, speaker notes, audience prompts, and an elapsed-time clock.

For reliable local serving:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Layout model

Scenes are composed on a fixed 1600 × 900 canvas. `presentation.js` scales the complete stage to fit the available viewport while preserving its 16:9 aspect ratio, so audience windows and presenter previews use the same composition. Define scene dimensions against that logical canvas; do not add viewport-width breakpoints that rearrange presentation content.

The presentation targets PPMonument and falls back to Inter/Arial if PPMonument is not installed. Place licensed PPMonument webfont files in `assets/fonts/` and add `@font-face` declarations in `styles.css` for an embedded build.
