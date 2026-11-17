# Turfbreak

A build-then-watch territory roguelite for web and Android.

```sh
npm ci
npm run dev
npm run check
npm run build:web
```

Node 22 or newer is required. See [design notes](docs/DESIGN.md), [progress](docs/PROGRESS.md) and the [agency playtest guide](docs/AGENCY_PLAYTEST.md).

`npm run build:playtest` creates an opt-in comparison build. Normal targets keep classic gameplay. Your playtest choice gates final balance tuning.
