MyraLoader from myra-agents. Use via `window.MyraUI.MyraLoader` (bundle loaded from the root `_ds_bundle.js`).

Animated Myra mark used as an in-progress indicator. `shimmer` pulses the 7
chevrons in a diagonal opacity/drift wave; `assemble` slides them in one by one,
holds, then slides them out (like the exported GIF). Fill is `currentColor` — set
the color via `text-*`. Every timing/geometry knob is overridable via props.
Honors `prefers-reduced-motion` (renders a static mark).
