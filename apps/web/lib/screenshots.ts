export const productShots = {
  dashboard: {
    file: "dashboard.png",
    alt: "Team dashboard for Harbor City Aquatics with 16 swimmers, volume and attendance charts, upcoming Harbor Invitational, and recent season best times.",
    caption: "Next meet, entry deadline, and recent best times.",
  },
  roster: {
    file: "roster.png",
    alt: "Roster of 16 Harbor City Aquatics swimmers grouped into Senior and Age Group for the current season.",
    caption: "One roster per team. Training groups live on the season.",
  },
  meets: {
    file: "meets.png",
    alt: "Meets hub showing Fall Kickoff and Harbor Invitational with entry progress for Harbor City Aquatics.",
    caption: "Entry progress for the meets on this team.",
  },
  entries: {
    file: "entries.png",
    alt: "Meet entries in program order for the women’s 100 freestyle at Harbor Invitational, with seed times filled from best times.",
    caption:
      "Program view in event order. Seed times from best times. Scratches stay on the row.",
  },
  workouts: {
    file: "workouts.png",
    alt: "Workout list with aerobic, threshold, and race-pace practices for Harbor City Aquatics.",
    caption: "Practice sets stay with the team you have open.",
  },
  calendar: {
    file: "calendar.png",
    alt: "September team calendar with weekday practices and Fall Kickoff on the same board.",
    caption: "Practices, meets, and attendance on one team calendar.",
  },
  progression: {
    file: "progression.png",
    alt: "Season best times by course for Harbor City Aquatics swimmers after Fall Kickoff.",
    caption:
      "Best times stay with this team, including after a results import.",
  },
  analytics: {
    file: "analytics.png",
    alt: "Analytics for Harbor City Aquatics with 7-day and 30-day volume, attendance rate, training charts, and team top times.",
    caption:
      "Yardage and attendance from practices you already ran, plus team top times.",
  },
  cutTracker: {
    file: "cut-tracker.png",
    alt: "Pro cut tracker listing Harbor City swimmers already at or faster than Pacific JO, with each best time next to the standard.",
    caption: "Pro: who is already at or under a time standard you entered.",
  },
  results: {
    file: "results.png",
    alt: "Fall Kickoff results with previous bests and Pacific JO time standards toggled on, showing who went under or over the cut.",
    caption:
      "New time and previous best on one row. Turn on a time standard you entered without leaving the meet.",
  },
} as const;

export type ProductShotId = keyof typeof productShots;
