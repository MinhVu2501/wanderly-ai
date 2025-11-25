export function normalizeSkeletonToSixBlocks(trip, hotelPerDay = []) {
  if (!trip || !Array.isArray(trip.days)) return trip;

  const required = [
    { section: "morning",    time: "08:00 - 10:30" },
    { section: "midday",     time: "10:45 - 12:00" },
    { section: "lunch",      time: "12:00 - 13:30" },
    { section: "afternoon",  time: "14:00 - 16:30" },
    { section: "evening",    time: "16:30 - 18:30" },
    { section: "dinner",     time: "18:30 - 20:00" },
    { section: "night",      time: "20:00 - 23:30" },
    { section: "late_night", time: "23:30 - 03:00" },
  ];

  trip.days.forEach((day, idx) => {
    if (!Array.isArray(day.blocks)) day.blocks = [];

    // build section index
    const bySection = new Map();
    for (const b of day.blocks) {
      const key = (b.section || "").toLowerCase();
      if (!bySection.has(key)) bySection.set(key, b);
    }

    // choose hotel
    const hotel =
      hotelPerDay[idx] ||
      hotelPerDay[0] ||
      day.hotel ||
      null;

    // normalize blocks
    const fixed = required.map((cfg) => {
      const existing = bySection.get(cfg.section) || {};
      return {
        section: cfg.section,
        time: existing.time || cfg.time,
        options: Array.isArray(existing.options) ? existing.options : [],
      };
    });

    day.blocks = fixed;
    if (hotel) day.hotel = hotel;
  });

  return trip;
}
