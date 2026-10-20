# Vendored libraries

Every runtime dependency is committed here at a pinned version, with its licence. The app loads
these files by relative path, so nothing is fetched from a CDN when the page runs.

To check a file is what it claims to be: `shasum -a 256 vendor/<path>` and compare below.

## Mol* (`molstar`) 5.13.1

A structure viewer. Used to show the target protein.

| | |
|---|---|
| Package | `molstar` 5.13.1, published 2026-10-08 |
| Licence | MIT — `molstar/5.13.1/LICENSE`, Copyright (c) 2017 - now, Mol* contributors |
| Source | https://registry.npmjs.org/molstar/-/molstar-5.13.1.tgz |
| Project | https://github.com/molstar/molstar |
| Tarball SHA-256 | `08e9292fb427bbebe9e1ecaef9e1b1066e2323dc4327e83692c4a5c3f14fff4e` |

Taken from the tarball's prebuilt viewer bundle, `package/build/viewer/`:

| File | Size | SHA-256 |
|---|---|---|
| `molstar/5.13.1/molstar.js` | 5.0 MB | `4fc6493c2471db8834dcc391151b344d7017e4eb8a4eb76c152be5f9dbd23874` |
| `molstar/5.13.1/molstar.css` | 72 KB | `22fbf73b75c11ef57687d08437c95dbfe8430ea895264f6da2b9b01e28bacc49` |
| `molstar/5.13.1/LICENSE` | 1 KB | `aa42900c6ea7bfcf22d25a4c369025e01a526c66501fd9193f9a8aecee7a0753` |

Why the prebuilt bundle and not the ES-module sources: `molstar.js` is one self-contained file that
needs no build step, which `AGENTS.md` requires. It is an IIFE that assigns a global `molstar`, not
an ES module, so `app/viewer.js` reads `window.molstar` instead of importing it. Ligella's own code
stays native ES modules.

Not vendored from this package: the viewer's themes, example HTML, skybox images and favicon, and
the `lib/` ES-module tree. Add a file here, with its hash, if the app comes to need it.

## Upgrading

1. Download the new tarball from the registry and record its SHA-256.
2. Extract into `vendor/molstar/<new-version>/` beside the old one.
3. Point `index.html` at the new path, check the viewer still loads a structure, then delete the old
   directory in the same commit.

## Model weights

None yet. When a model is added, record its source, licence and file hashes in this file, and keep
the weights out of git if they are large.
