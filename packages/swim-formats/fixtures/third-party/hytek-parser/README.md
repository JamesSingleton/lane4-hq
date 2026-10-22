# SwimComm hytek-parser fixtures

Eight Meet Manager `.hy3` result slices from
[SwimComm/hytek-parser](https://github.com/SwimComm/hytek-parser)
`tests/hy3/fixtures`, MIT (see `LICENSE.md`, Copyright 2022 Nino Maruszewski).

Upstream already replaced swimmer names, birth dates, USA IDs, and contact
fields with same-width placeholders. That redaction **broke the HY3 line
checksums** and they were not recomputed. Lane4 uses these files for
**parse tests only**. Do not byte-compare an export against them.

Each file's Meet Manager generation is described in the upstream fixture
README.
