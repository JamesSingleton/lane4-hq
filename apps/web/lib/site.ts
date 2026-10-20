export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3001"
    : "https://admin.lane4hq.com");

export const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL ?? "http://localhost:3004";

export const SIGN_IN_URL = `${APP_URL}/sign-in`;
export const SIGN_UP_URL = `${APP_URL}/sign-up`;
export const GITHUB_URL = "https://github.com/JamesSingleton/lane4-hq";
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`;

export const SITE_NAME = "Lane4 HQ";

export const SITE_TAGLINE =
  "Open beta for high school and club coaches. Seed times, entries, and Sunday's results.";

export const SITE_TITLE = `${SITE_NAME} · swim team software for coaches, in open beta`;

export const SITE_DESCRIPTION =
  "Lane4 HQ is in open beta for high school and club swim coaches. Best times fill seed times, you export HY3, CL2, or SDIF, and results come back next to previous best.";

export const PRIMARY_CTA = "Join the open beta";

export const PRICE_NOTE =
  "Dollar prices are not published on this site. Free, Pro, and Enterprise describe seats and features. A paid plan is billed in the app when you choose it.";

export const COMING_SOON_DESKTOP =
  "A desktop meet manager for hosts is in progress. It is not part of this open beta, and it is not available to download from this site.";

export const productLinks = [
  {
    href: "/product/meets",
    title: "Meets and entries",
    description:
      "Seeds from best times, the file the host asked for, then Sunday next to previous best.",
    shot: "entries" as const,
  },
  {
    href: "/product/roster",
    title: "Roster",
    description:
      "Class year on a high school season. A USA Swimming ID on a club membership.",
    shot: "roster" as const,
  },
  {
    href: "/product/workouts",
    title: "Workouts",
    description:
      "Write the set on the same calendar as the dual or the invitational.",
    shot: "workouts" as const,
  },
  {
    href: "/product/calendar",
    title: "Calendar",
    description:
      "Practices, meets, attendance, and the entry deadline when the file had one.",
    shot: "calendar" as const,
  },
  {
    href: "/product/progression",
    title: "Progression",
    description:
      "Best times and season charts stay with the team you have open.",
    shot: "progression" as const,
  },
  {
    href: "/product/analytics",
    title: "Analytics",
    description:
      "Yardage, attendance, and top times. Pro adds who is already under a cut.",
    shot: "analytics" as const,
  },
] as const;

export const audienceLinks = [
  {
    href: "/for/high-school",
    title: "High school",
    description:
      "Duals and invitationals, class year, age groups such as JV and Varsity from the host file, and association scoring caps.",
  },
  {
    href: "/for/club",
    title: "Club teams",
    description:
      "Invitational meet weeks, a USA Swimming ID on the membership, and cuts such as JO or sectionals that you enter.",
  },
] as const;

export const formats = [
  {
    code: "HY3",
    use: "Entries and results for Hy-Tek Meet Manager.",
    direction: "Import and export",
  },
  {
    code: "CL2",
    use: "Older entry and result packs, including CL2-only files.",
    direction: "Import and export",
  },
  {
    code: "EV3",
    use: "Event files with sessions, events, and qualifying times.",
    direction: "Import",
  },
  {
    code: "HYV",
    use: "Event files from Meet Manager invitational setups.",
    direction: "Import",
  },
  {
    code: "SDIF / SD3",
    use: "Interchange when the host asked for SDIF, including TeamUnify and SwimTopia.",
    direction: "Import and export",
  },
  {
    code: "XLS",
    use: "Meet Manager event reports, when you do not have a binary pack.",
    direction: "Import",
  },
  {
    code: "ZIP",
    use: "Event, entry, or result files bundled in one download.",
    direction: "Import",
  },
] as const;

export const weekLoad = [
  {
    waste: "Seed times",
    from: "Retyping them from a printout, last season's Team Manager, or a spreadsheet.",
    to: "The swimmer's best time fills the seed. You can still change it before you export.",
  },
  {
    waste: "Who is entered",
    from: "A whiteboard, a group text, and the host's event file that do not agree.",
    to: "One meet. Read it in the order it is swum, or by swimmer when you check who has too many events.",
  },
  {
    waste: "The lineup",
    from: "Building individuals and relays the night before entries are due.",
    to: "Individuals and relays sit on the meet. On Pro, leftover individual spots can fill from eligible best times. Relays stay as you staffed them.",
  },
  {
    waste: "Sunday's results",
    from: "Pasting the file into Excel so you can see who dropped time.",
    to: "Import the results. The new time sits next to previous best. Faster swims update best times.",
  },
  {
    waste: "The cut",
    from: "Keeping a high school standard, JO, or sectionals in your head.",
    to: "Turn on a time standard you entered and see who went under on that meet. Pro lists the whole roster against it.",
  },
] as const;

export const meetWeek = [
  {
    title: "Bring in the event file",
    body: "Import EV3, HYV, XLS, or a ZIP. Sessions, events, age groups, and qualifying times land on the meet. Dive events in a combined file stay off the swim entry board.",
  },
  {
    title: "Mark who is going",
    body: "Enter individuals with seed times from best times, staff relays with four legs plus alternates, and scratch without deleting the row. A Tuesday dual and a Saturday invitational use the same lineup.",
  },
  {
    title: "Send the file they asked for",
    body: "Export HY3 or CL2 for Meet Manager, or SDIF when that is what the host asked for. Print the individual entries and a split sheet before you send it. A host can still reject a file.",
  },
  {
    title: "Bring results back",
    body: "Import HY3, CL2, SDIF, or a ZIP. Previous best sits next to the new time. Turn on a time standard you entered to see who went under. Faster swims update best times. Unmatched rows stay on the review list.",
  },
] as const;

/** Illustrative times for the hero. Not a team, a swimmer, or a result. */
export const exampleProgram = [
  {
    event: "7",
    name: "Girls 200 medley relay",
    seed: "1:48.22",
    source: "Entered",
  },
  {
    event: "8",
    name: "Girls 200 freestyle",
    seed: "1:52.06",
    source: "Best time",
  },
  {
    event: "9",
    name: "Girls 200 individual medley",
    seed: "2:08.41",
    source: "Best time",
  },
] as const;

export const lane4Today = [
  {
    work: "Roster, practices, entries, and results for the team you take to a meet",
    status: "In the beta",
  },
  {
    work: "Seed times filled from best times, with a manual override",
    status: "In the beta",
  },
  {
    work: "Import HY3, CL2, EV3, HYV, SDIF/SD3, XLS event reports, and ZIP packs",
    status: "In the beta",
  },
  {
    work: "Export HY3, CL2, or SDIF for the host",
    status: "In the beta",
  },
  {
    work: "High school class year, and association caps for scoring entries and relay teams",
    status: "In the beta",
  },
  {
    work: "One login for a club team and a high school team, with separate rosters and times",
    status: "In the beta",
  },
  {
    work: "Running the meet: merging every team's entries, seeding the full session, or a timing console",
    status: "Not in the beta",
  },
  {
    work: "Desktop meet manager for hosts and officials",
    status: "Coming soon",
  },
  {
    work: "Family accounts, messaging, or dues",
    status: "Not offered",
  },
  {
    work: "A built-in JO, sectional, or state standards book",
    status: "Not offered",
  },
  {
    work: "Syncing a USA Swimming SWIMS roster as an approved vendor",
    status: "Not offered",
  },
] as const;

export const competitorRoles = [
  {
    name: "Hy-Tek Team Manager",
    body: "The desktop program many coaches already use to keep a roster and build an entry file. Lane4 is that visiting-team work in the browser. The export is a file Meet Manager can open. This page does not audit Team Manager's current edition.",
  },
  {
    name: "Hy-Tek Meet Manager",
    body: "What the host uses to receive files and run the meet. Lane4 exports HY3 or CL2 for that import. It does not replace Meet Manager in this beta. A desktop meet manager is in progress and is not available here.",
  },
  {
    name: "TeamUnify",
    body: "A club platform many teams use for their site and for meet files. When a host asks for SDIF, Lane4 can export that interchange. Lane4 does not provide family accounts or dues.",
  },
  {
    name: "SwimTopia",
    body: "Another club and meet platform hosts already accept files from. Lane4 can import and export SDIF for that handoff. It does not provide a parent portal.",
  },
  {
    name: "Commit Swimming",
    body: "A training product coaches use when the workout is the product. Lane4 includes workouts, attendance, and yardage on the same team as the meet entries. This page does not compare workout depth.",
  },
] as const;

export const faqs = [
  {
    question: "Is the coach workspace in open beta?",
    answer:
      "Yes. You can create a team and use roster, meets, workouts, calendar, and times now. The desktop meet manager for hosts is not part of the beta and is not offered as a download on this site.",
  },
  {
    question: "Do you host meets or merge other teams' entries?",
    answer:
      "No. You manage the roster, entries, and results for meets your team attends, whether that is a high school dual or a club invitational. The host receives files and runs the pool in Meet Manager, SwimTopia, SwimCloud, or TeamUnify. Lane4 HQ does not merge other teams' entries or replace a timing console.",
  },
  {
    question: "I host meets. Can officials run the meet in Lane4?",
    answer:
      "Not in this beta. Hosts still run the meet in their own software. A desktop meet manager is in progress. This site does not describe it as available.",
  },
  {
    question: "Will the host be able to open the file?",
    answer:
      "You export the interchange those programs already use: HY3 or CL2 for Meet Manager, SDIF when the host asked for it. Lane4 HQ does not operate their import. A host can still reject a file under their own rules.",
  },
  {
    question: "What is free, and what is Pro?",
    answer:
      "Free includes one coach seat, unlimited swimmers, unlimited meets, meet import and export, seed times from best times, progression, and high school class year and association event limits. Practice drafts and relay-order suggestions share one pool: 5 a month on Free. Pro adds up to 5 coach seats, lineup suggestions for open individual spots, a roster-wide cut list, and 20 drafts a month, with overage allowed after that. Enterprise is unlimited coach seats and 100 drafts a month, then overage. Dollar prices are not listed on this site.",
  },
  {
    question: "Can an athletic director use the same team?",
    answer:
      "There is no separate athletic-director product. Invite another coach onto the team and they see that team's roster, lineup, and export. Free is one coach seat, so a second person needs Pro or Enterprise. Meet import and export stay with the owner and head coach.",
  },
  {
    question: "Can one login cover a club team and a high school team?",
    answer:
      "Yes. Switch teams without signing out. Roster, meets, and times stay with each team. High school uses class year and association event limits. A club roster can store a USA Swimming ID, and SafeSport training gates minor contact and medical fields on teams where that requirement applies. Lane4 HQ is not certified or approved by USA Swimming.",
  },
  {
    question: "Is there a parent portal or dues?",
    answer:
      "No. No family accounts, messaging, or dues. This is the coach's workspace.",
  },
  {
    question: "Do I still need Team Manager?",
    answer:
      "The host still uses Meet Manager, SwimTopia, SwimCloud, or TeamUnify to receive the file. Your roster, lineup, printed entries, and times can live here, for a high school or a club, so seeds and best times stay out of a second spreadsheet.",
  },
] as const;

export const plans = [
  {
    id: "free",
    name: "Free",
    seats: "1 coach seat",
    summary:
      "Seeds, the lineup, and progression for one coach. High school or club.",
    cta: PRIMARY_CTA,
    href: SIGN_UP_URL,
    featured: true,
    features: [
      "Unlimited swimmers and meets",
      "Meet import and HY3, CL2, and SDIF export",
      "Seed times from best times",
      "Progression by course",
      "High school class year and association event limits",
      "5 practice drafts or relay suggestions / month",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    seats: "Up to 5 coach seats",
    summary:
      "Extra coaches, leftover individual spots filled from best times, and a roster-wide cut list.",
    cta: "Start Pro from the app",
    href: SIGN_UP_URL,
    featured: false,
    features: [
      "Everything on Free",
      "Lineup suggestions for open individual spots",
      "Roster-wide cut tracking",
      "20 practice drafts or relay suggestions / month, then overage",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    seats: "Unlimited coach seats",
    summary: "For a staff larger than five coaches.",
    cta: "Talk with us",
    href: "/support",
    featured: false,
    features: [
      "Everything on Pro",
      "Unlimited coach seats",
      "100 practice drafts or relay suggestions / month, then overage",
    ],
  },
] as const;
