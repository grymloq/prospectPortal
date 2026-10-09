# Faction avatars

The 36 factions in the bundled New Recruit catalogue have local vector avatars in `public/factions`. `src/data/faction-avatars.json` records each original asset URL and publisher. Retrieved 9 October 2026.

Most are 40K Gallery's faction/chapter emblems, reused with the credit and backlink requested by its [SVG collection](https://40k.gallery/warhammer-40k-svg-icons/) and [download permission](https://40k.gallery/download/svg/black-templars/). Agents of the Imperium uses the Inquisition emblem; Chaos Daemons uses the Chaos Undivided emblem; Adeptus Custodes uses the Custodian emblem.

Chaos Knights and Titanicus Traitoris use the corresponding published SVGs from [wh40k-icon](https://certseeds.github.io/wh40k-icon/). The publisher's README licenses published non-font artifacts under CC BY-NC-SA 4.0. Attribution, change notice, adapted SVGs and the full asset license are publicly available in `/factions/credits.html`. Preserve their noncommercial and share-alike terms when reusing those two assets; this asset license does not relicense application code. The workspace footer links both publishers' credits. Games Workshop owns the underlying faction iconography.

All vectors were reduced to an allowlist of SVG geometry and presentation attributes. Scripts, links, embedded resources, editor metadata and unused definitions/styles are absent. Geometry is preserved; black fills replace equivalent near-black stylesheet classes. The site serves files locally, with no runtime requests to the source sites.

`FactionName` renders a decorative 20px icon beside the recorded name. `FactionAvatar` supports standalone accessible avatars and a configurable size for other placements. Names resolve through punctuation-insensitive aliases, without rewriting army records, catalogue IDs or historical names. Unknown names use an initial fallback. Native select options remain readable text because browser option rendering does not reliably support images.

Used in army libraries, My armies, profiles and preferred armies, prospect and selection tables, journal summaries/details, matrix filters and headers/tooltips, mobile matchups and revealed scrim rosters/results. Existing server filtering and publication boundaries are unchanged.
