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
  "Seed times, meet entries, and Sunday's results for club and high school coaches.";

export const SITE_TITLE = `${SITE_NAME} · seed times, entries, and results for coaches`;

export const SITE_DESCRIPTION =
  "Stop retyping seed times the night entries are due. Lane4 fills them from best times and puts Sunday's results next to previous best, for club and high school.";

export const PRIMARY_CTA = "Create your free team";

export const productLinks = [
  {
    href: "/product/roster",
    title: "Roster",
    description:
      "Bring returning swimmers into the new season without retyping birthdays.",
    shot: "roster" as const,
  },
  {
    href: "/product/meets",
    title: "Meets and entries",
    description:
      "Seeds from best times, the file the host asked for, then Sunday next to previous best.",
    shot: "entries" as const,
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
    href: "/for/club",
    title: "Club teams",
    description:
      "Invitational meet weeks, a USA Swimming ID on the roster, and cuts such as JO or sectionals that you enter.",
  },
  {
    href: "/for/high-school",
    title: "High school",
    description:
      "Duals and invitationals, class year, JV and Varsity, and association event limits.",
  },
] as const;

export const formats = [
  {
    code: "HY3",
    use: "Entries and results for Hy-Tek Meet Manager.",
  },
  {
    code: "CL2",
    use: "Older entry and result packs, including CL2-only files.",
  },
  {
    code: "EV3",
    use: "Event files with sessions, events, and qualifying times.",
  },
  {
    code: "HYV",
    use: "Event files from Meet Manager invitational setups.",
  },
  {
    code: "SDIF / SD3",
    use: "Interchange when the host asked for SDIF, including TeamUnify and SwimTopia.",
  },
  {
    code: "XLS",
    use: "Meet Manager event reports, when you do not have a binary pack.",
  },
  {
    code: "ZIP",
    use: "Event, entry, or result files bundled in one download.",
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
    from: "Keeping JO, sectionals, or the high school standard in your head.",
    to: "Turn on a time standard you entered and see who went under on that meet. Pro lists the whole roster against it.",
  },
] as const;

export const meetWeek = [
  {
    title: "Bring in the event file",
    body: "Import EV3, HYV, XLS, or a ZIP. Sessions, events, divisions, and qualifying times land on the meet. Dive events in a combined file stay off the swim entry board.",
  },
  {
    title: "Mark who is going",
    body: "Enter individuals with seed times from best times, staff relays, and scratch without deleting the row. A Saturday invitational and a Tuesday dual use the same lineup.",
  },
  {
    title: "Send the file they asked for",
    body: "Export HY3 or CL2 for Meet Manager, or SDIF when that is what the host asked for. Print the entries and a split sheet before you send it.",
  },
  {
    title: "Bring results back",
    body: "Import HY3, CL2, SDIF, or a ZIP. Previous best sits next to the new time. Turn on a time standard you entered — JO, sectionals, or a high school cut — to see who went under. Faster swims update best times. Unmatched rows stay visible.",
  },
] as const;

export const coachEasier = [
  {
    title: "Sunday's results sit next to previous best",
    body: "Import the file. Previous best is on the row. Compare a cut you entered without leaving the meet.",
    href: "/product/meets",
  },
  {
    title: "See who is already under a cut you entered",
    body: "Enter JO, sectionals, or a high school standard. Pro lists who is already at or under it, by event.",
    href: "/product/analytics",
  },
  {
    title: "Check who was at practice before you name a relay",
    body: "Attendance and yardage come from the practices you already ran.",
    href: "/product/analytics",
  },
  {
    title: "Club times and high school times stay on separate teams",
    body: "A swimmer on both your club and your high school does not rewrite one team's times with the other's.",
    href: "/product/progression",
  },
] as const;

export const faqs = [
  {
    question: "Do you host meets or merge other teams' entries?",
    answer:
      "No. You manage the roster, entries, and results for meets your team attends, whether that is a club invitational or a high school dual. The host receives files and runs the pool in Meet Manager, SwimTopia, SwimCloud, or TeamUnify. Lane4 HQ does not merge other teams' entries or replace a timing console.",
  },
  {
    question: "Will the host be able to open the file?",
    answer:
      "You export the interchange those programs already use: HY3 or CL2 for Meet Manager, SDIF when the host asked for it. Lane4 HQ does not operate their import. A host can still reject a file under their own rules.",
  },
  {
    question: "What is free, and what is Pro?",
    answer:
      "Free includes one coach seat, unlimited swimmers, unlimited meets, meet import and export, seed times from best times, progression, and high school class year and association event limits. Practice drafts and relay-order suggestions share one pool: 5 a month on Free. Pro adds more coach seats, lineup suggestions for open individual spots, a roster-wide cut list, and 20 drafts a month, with overage allowed after that.",
  },
  {
    question: "Can one login cover a club team and a high school team?",
    answer:
      "Yes. Switch teams without signing out. Roster, meets, and times stay with each team. High school uses class year, JV and Varsity, and association event limits. A club roster can store a USA Swimming ID, and SafeSport training gates minor contact and medical fields. Lane4 HQ is not certified or approved by USA Swimming.",
  },
  {
    question: "Is there a parent portal or dues?",
    answer:
      "No. No family accounts, messaging, or dues. This is the coach's workspace.",
  },
  {
    question: "Do I still need Team Manager?",
    answer:
      "The host still uses Meet Manager, SwimTopia, SwimCloud, or TeamUnify to receive the file. Your roster, lineup, printed entries, and times can live here, for a club or a high school, so seeds and best times stay out of a second spreadsheet.",
  },
] as const;

export const plans = [
  {
    id: "free",
    name: "Free",
    seats: "1 coach seat",
    summary:
      "Seeds, the lineup, and progression for one coach. Club or high school.",
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
