# Lane4 HQ

Visiting-team coach workspace: roster, meet entries, results, and progression for meets a team attends.

## Language

**Meet lineup snapshot**:
The visiting team's entered lineup for one meet, including individual entries, grouped relay teams, and going / eligibility / scratch status as data.
_Avoid_: export payload, entry list, projection

**Entry candidates**:
The team's swimmers who could be entered in a meet, with their best times for that meet's events. Coaches pick from them when building the lineup. They are not part of the meet lineup snapshot, so host packs and paper reports never carry the whole roster.
_Avoid_: roster dump, available swimmers list

**Host pack**:
The Hy-Tek / SDIF files a coach sends to a meet host (HY3, CL2, SDIF). Built by filtering a meet lineup snapshot, not by rebuilding it.
_Avoid_: event file, EV3, HYV

**Paper report**:
The Team Manager–style individual meet entries document a coach reviews, plus a split sheet with blank write-in boxes for race splits. Both read the same meet lineup snapshot and do not drop not-going swimmers. Default omits relay alternates; coaches can include them. Split cadence (25/50/100) is a print-only override and is not saved. Blank relay lines (names off the boxes, planned lineup still listed) is opt-in and off by default.
_Avoid_: CSV, host pack, timing console

**Program view**:
Entries grouped by meet event number, individuals and relays together in the order of the meet. It reads the meet lineup snapshot, like host packs and paper reports.
_Avoid_: matrix, by-name board

**Association event cap**:
Max scoring (non-exhibition) names per individual event, and max relay teams (A/B/C) per relay event, from the team’s high-school association. Not the per-athlete EV3 entry limits, and not a governing-body lookup table.
_Avoid_: AIA table, CIF table, max entries per athlete

**Competition course**:
The physical pool course for a meet: SCY, SCM, or LCM. It identifies event keys, results, and personal bests.

**Entry-time policy**:
The host software’s rule for selecting a swimmer’s seed time. A Hy-Tek code such as `Y`, `YO`, or `YLS` may require conversion, an exact-course time, or course-priority qualifying checks. It is distinct from the competition course.

**Capture**:
A race pulled from the timing console, stored verbatim with its raw bytes. It is assigned to an event and heat but isn't official until verified. Captures are never deleted; false starts and test swims are marked ignored.
_Avoid_: result, race result

**Verified heat**:
A heat an official has reviewed against the heat sheet and made official. Only verified heats count toward places, team scores, exports, and publishing. Re-verifying bumps the heat's revision.
_Avoid_: finished heat, completed race

**Heat publication**:
One verified heat sent from the deck machine to Lane4 (`lane4.heat-results/v1`). Its idempotency key is meet, event, heat, and revision.
_Avoid_: sync, upload
