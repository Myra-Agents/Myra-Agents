// Entry point. The desktop sidecar build (`scripts/build-sidecar.mjs`) and
// `bun src/index.ts` both compile/run this file, so it must route argv exactly
// like the standalone binary — all lifecycle commands live in `main.ts`.
import "./main";
