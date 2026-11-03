# 0006. Two-pool meets on two computers

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

High school dual meets and some invitationals swim girls and boys in two pools at once, each with its own timing console and deck computer. Event numbering varies by meet. This season's high school meets put boys on odd numbers and girls on even. USA Swimming meets usually swim girls first in each pair. Other meets number all the girls' events first and then all the boys'. Coaches want three things at the end: boys results, girls results, and combined results, plus team scores. The combined score is announced only after the meet.

[ADR 0004](0004-offline-meet-store-and-publishing.md) made the deck machine the source of truth for a meet and said nothing about two machines sharing one. Pool decks may or may not have WiFi.

For comparison, Hy-Tek Meet Manager copies one meet database to every computer and merges results by file ("Export Results for Meet Manager Merge", then "Import Merge Results"), with a paid network option for a shared database. SwimTopia Meet Maestro syncs every computer through its servers in real time and doesn't share changes between computers while offline.

## Decision

1. **One meet, split into pools.** A meet can carry a `split` (`Meet.split`, `@lane4hq/meet-engine/pools`): its pools, which pool this copy runs (`localPoolId`), and hand assignments for single events. `splitByGender` makes a girls pool (female and mixed events) and a boys pool (male events). Pool ids are fixed (`girls`, `boys`), so every copy agrees on them.
2. **Events belong to a pool by gender, not by number.** `eventPoolId` uses the hand assignment first, then the prelim's pool for a final, then the pool for the event's gender. Mixed relays and diving can be moved by hand (`assignEventToPool`) until they have results.
3. **Set up once, then copy.** Teams and entries go in on one computer. The meet is split there and copied to the second computer as a meet backup. The second computer sets "This computer runs" to its own pool. Renumbering events is refused once a meet is split, because both copies must keep the same event numbers.
4. **Each computer runs only its own pool's events.** Every meet-engine function that changes an event, its entries, heats, dive sheets, finals, or results calls `assertRunsEvent`, and `seedAllEvents` skips the other pool. Timer races are suggested only for this pool's events. The desktop greys out the other pool's events and disables their controls.
5. **Merge by file at the end.** On the Export screen, "Merge other pool's backup" reads the other computer's `.lane4meet` file (`store_read_backup`, which reads it without importing it) and runs `mergePoolCopy`. For every event the other pool runs, its events, entries, heats, results, dive sheets, heat records, and assigned captures replace this copy's. This copy's own events are untouched. Merging works in either direction and merging again changes nothing, so no computer has to be the main one and a corrected heat can be merged again. The merge flags swimmers both pools may have added on deck (same team and USA Swimming id, or same name and birth date) for an official to check. It doesn't combine them.
6. **Girls, boys, and combined.** `teamScores` and the results exports (`teamResultsMeet`, `exportTeamResults`, `exportAllTeamResults`) take an optional gender. Files get a `-Girls` or `-Boys` suffix.
7. **Live results don't change.** Each computer publishes its own verified heats to the same hosted meet. Heats are keyed by event, so they don't collide. If both computers publish the same revision of a heat with different results, the API answers `409 revision_conflict`. The desktop then marks the heat as failed, and an official re-verifies it.

## Consequences

- Two pools work with no network. One file swap at the end gives the combined meet, which is when the combined score is announced.
- Scores on each computer cover only its own pool until the merge. The Results screen says so.
- Late team entries and other whole-meet setup belong before the split. After it, each computer can only add entries to its own events.
- If both copies claim the same event (one moved it by hand), the merge keeps this copy's results and lists the event numbers for an official.
- Live multi-machine sync (over WiFi or through Lane4) is not built. The file merge stays as the offline fallback if it ever is.
