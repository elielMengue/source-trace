# Source-Trace — logo assets (master: 2a "Source Graph")

Brand colours
  Ink     #14182B
  Indigo  #4457F0   (primary / trace stroke + tile)
  Teal    #16B8A6   (secondary)
  Amber   #F6A623   (the source node — always this colour)

Type
  Wordmark / display : Space Grotesk
  UI / labels        : IBM Plex Sans

Files
  icons/icon-16.png … icon-128.png   Chrome extension icon set (indigo tiles).
                                      16 & 32 use the "min" variant (top edge dropped,
                                      fatter strokes) for legibility; 48 & 128 use the
                                      full mark.
  icons/glyph-*.png / *.svg          Transparent-background glyphs (brand, mono ink,
                                      mono white).
  icons/source-graph*.svg            Vector sources (full, min, tile, mono).
  icons/wordmark-lockup.svg          Horizontal icon + wordmark lockup.

manifest.json (Chrome MV3)
  "icons": { "16":"icons/icon-16.png","32":"icons/icon-32.png",
             "48":"icons/icon-48.png","128":"icons/icon-128.png" },
  "action": { "default_icon": { "16":"icons/icon-16.png","32":"icons/icon-32.png" } }

Note: the wordmark SVG uses live text; embed or convert Space Grotesk to outlines
before handing to external tools that lack the font.
