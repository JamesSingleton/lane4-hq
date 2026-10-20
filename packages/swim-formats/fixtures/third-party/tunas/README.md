# tunas golden fixtures

Scrubbed copies of three MIT fixtures from
[ajoe2/tunas](https://github.com/ajoe2/tunas) `tests/data`
(see `LICENSE`, Copyright 2025 Andy Joe):

- `reno_walk_on_meet.cl2` and `reno_walk_on_meet.expected.json`
- `aaa_league_championship.cl2` and `aaa_league_championship.expected.json`
- `pasa_distance_intersquad.hy3` and `pasa_distance_intersquad.expected.json`

Swimmer and coach names, USA IDs, birth dates, preferred names, club
address lines, and the file contact name and phone were replaced with
same-width fakes. The same character substitution is used in the meet
file and in the expected JSON, so ids and names still join. Meet names,
dates, times, places, and team codes are unchanged.

CL2 and HY3 line checksums were recomputed from the raw bytes (CP-1252;
these files are ASCII) and checked: CL2 columns 159–160 with a ` N` or
`NN` prefix (`NN` on these results `D0` lines), HY3 columns 129–130.
The raw upstream files are not in this repository.

The expected JSON is tunas's field-level oracle for prelims, finals,
relays, and `D3` / `D1` identity. It is not an export byte-diff.
