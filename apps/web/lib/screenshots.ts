export const productShots = {
  dashboard: {
    file: "dashboard.png",
    alt: "Saguaro Ridge High School dashboard on October 22, 2026, with 30 active swimmers, 93 percent attendance, and the AIA Division II Championships two days away.",
    caption:
      "Next meet, entry progress, and recent best times for the team you have open.",
  },
  roster: {
    file: "roster.png",
    alt: "Saguaro Ridge roster for 2026 with 15 boys and 15 girls, class year, and varsity groups.",
    caption:
      "One roster for the season. Class year and training group sit on each swimmer.",
  },
  meets: {
    file: "meets.png",
    alt: "Meets list for Saguaro Ridge, including duals, the East Valley Invitational, and Division II championships.",
    caption:
      "Every meet for this team, with import and add meet on the same page.",
  },
  entries: {
    file: "entries.png",
    alt: "Entries for the AIA Division II Championships in program order, with a cap of 2 individual events and 2 relays.",
    caption: "Program order. Open an event to place swimmers and relays.",
  },
  workouts: {
    file: "workouts.png",
    alt: "Workout library for Saguaro Ridge with a 5,200 yard Tuesday aerobic practice.",
    caption: "Practice sets stay with the team you have open.",
  },
  calendar: {
    file: "calendar.png",
    alt: "October 2026 calendar for Saguaro Ridge with weekday practices and Saturday meets.",
    caption: "Practices and meets on one team calendar.",
  },
  progression: {
    file: "progression.png",
    alt: "Riley Adams progression for the girls 100 yard breaststroke across the 2026 season.",
    caption:
      "Pick a swimmer and an event. The chart uses this team's times only.",
  },
  analytics: {
    file: "analytics.png",
    alt: "Analytics for Saguaro Ridge with 5,200 yards over 30 days, 93 percent attendance, and team top times.",
    caption:
      "Yardage and attendance from practices you already ran, plus team top times.",
  },
  cutTracker: {
    file: "cut-tracker.png",
    alt: "Cut tracker listing Saguaro Ridge swimmers already at or under the 2026 Division II goal times.",
    caption: "Who is already at or under a time standard you entered.",
  },
  results: {
    file: "results.png",
    alt: "East Valley Invitational results for Saguaro Ridge, with 44 individual swims, 6 relays, and personal-best filters.",
    caption:
      "Times stay on the meet. Turn on personal bests or a time standard without leaving the page.",
  },
} as const;

export type ProductShotId = keyof typeof productShots;
