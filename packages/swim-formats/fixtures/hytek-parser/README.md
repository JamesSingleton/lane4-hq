# SwimComm hytek-parser HY3 fixtures

PII-redacted Meet Manager `.hy3` slices from
[SwimComm/hytek-parser](https://github.com/SwimComm/hytek-parser)
(`tests/hy3/fixtures`, MIT). Lane4 uses them as **parse tests only**.
They are not round-trip oracles: the upstream redaction kept column width
but did not recompute line checksums.

See that repository's fixture README for which Meet Manager generation
each file covers. Do not add expected-state JSON from other parsers.
