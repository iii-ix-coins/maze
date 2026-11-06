# Home feature

`LegacyHomePage.tsx` is intentionally a compatibility host. Migrate the existing header, brand header, interaction bar and share modal into independent React components one at a time. Remove each legacy script from `bootLegacyHomeScripts()` only after its React replacement passes visual and functional parity tests.
