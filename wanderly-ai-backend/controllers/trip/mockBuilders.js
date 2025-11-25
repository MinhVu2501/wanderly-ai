export function buildTripPlanV3Mock({ from, to, startDate, endDate, travelType, transportPreference, budget, language, hotelPerDay }) {
  const daysCount = (() => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff || 1);
  })();

  const mkTime = (h1, m1, dur) => {
    const pad = (n) => String(n).padStart(2, '0');
    const start = `${pad(h1)}:${pad(m1)}`;
    let endM = h1 * 60 + m1 + dur;
    const eh = Math.floor(endM / 60) % 24;
    const em = endM % 60;
    return `${start} - ${pad(eh)}:${pad(em)}`;
  };

  const sections = ['morning', 'midday', 'afternoon', 'evening'];
  const seeds = {
    landmark: ['Landmark', 'Memorial', 'Tower', 'Gate', 'Square'],
    museum: ['Museum', 'Gallery', 'Exhibition Hall', 'Heritage Center'],
    restaurant: ['Bistro', 'Grill', 'Kitchen', 'Ramen', 'Sushi Bar'],
    cafe: ['Cafe', 'Coffee Roasters', 'Tea House', 'Bakery'],
    bar: ['Bar', 'Lounge', 'Jazz Club', 'Rooftop'],
    viewpoint: ['Skydeck', 'Viewpoint', 'Scenic Point'],
  };
  const makeName = (base, idx) => `${to} ${base} D${idx + 1}`;
  const baseOptions = (lat, lng, dayIdx) => [
    { name: makeName(seeds.landmark[dayIdx % seeds.landmark.length], dayIdx), type: 'landmark', description: `Famous sight in ${to}.`, famousFor: 'Iconic view', whatToDo: 'Photos and walk', address: `${to} center`, lat, lng, distanceFromPrevious: '1.0 km', transport: transportPreference, estimatedCost: 0, rating: 4.5, label: 'Top Pick', tags: ['photogenic'] },
    { name: makeName(seeds.museum[dayIdx % seeds.museum.length], dayIdx), type: 'museum', description: `Popular museum in ${to}.`, famousFor: 'Collections', whatToDo: 'Exhibitions', address: `${to}`, lat, lng, distanceFromPrevious: '0.8 km', transport: transportPreference, estimatedCost: 15, rating: 4.3, label: 'Very Popular', tags: ['culture'] },
  ];

  const days = Array.from({ length: daysCount }, (_, i) => {
    const hotel = hotelPerDay[i] || hotelPerDay[0] || { name: `${to} Hotel`, address: `${to}`, lat: 0, lng: 0 };
    const blocks = sections.map((sec, si) => ({
      time: mkTime(9 + si * 2, 0, 60),
      section: sec,
      options: baseOptions(hotel.lat || 0, hotel.lng || 0, i),
    }));
    // Add lunch and dinner blocks per rules
    blocks.splice(2, 0, {
      time: mkTime(12, 0, 60),
      section: 'midday',
      options: [
        { name: makeName(seeds.restaurant[i % seeds.restaurant.length], i), type: 'restaurant', description: `Well-rated restaurant.`, famousFor: 'Local dishes', whatToDo: 'Lunch', address: `${to}`, lat: hotel.lat || 0, lng: hotel.lng || 0, distanceFromPrevious: '0.5 km', transport: transportPreference, estimatedCost: 30, mustTryDish: 'Chef special', rating: 4.2, label: 'Very Popular', tags: ['food'] },
      ],
    });
    blocks.push({
      time: mkTime(18, 0, 90),
      section: 'evening',
      options: [
        { name: makeName(seeds.restaurant[(i + 1) % seeds.restaurant.length], i), type: 'restaurant', description: `Dinner spot.`, famousFor: 'Steak', whatToDo: 'Dinner', address: `${to}`, lat: hotel.lat || 0, lng: hotel.lng || 0, distanceFromPrevious: '0.7 km', transport: transportPreference, estimatedCost: 45, mustTryDish: 'Steak', rating: 4.3, label: 'Top Pick', tags: ['food'] },
        { name: makeName(seeds.cafe[i % seeds.cafe.length], i), type: 'cafe', description: `Cozy cafe.`, famousFor: 'Coffee', whatToDo: 'Dessert', address: `${to}`, lat: hotel.lat || 0, lng: hotel.lng || 0, distanceFromPrevious: '0.3 km', transport: transportPreference, estimatedCost: 8, recommendedDrink: 'Latte', rating: 4.1, label: 'Relaxed Option', tags: ['coffee'] },
      ],
    });

    return {
      day: i + 1,
      date: new Date(new Date(startDate || Date.now()).getTime() + i * 86400000).toISOString().split('T')[0],
      hotel,
      blocks,
    };
  });

  return {
    flight: { averageCost: 1200, currency: 'USD', duration: '11h 45m', airports: { departure: from.split(',')[0] || 'DEP', arrival: to.split(',')[0] || 'ARR' }, notes: 'Mock flight estimate.' },
    travelStyle: { type: travelType, summary: 'Mock summary.' },
    hotels: hotelPerDay.filter(Boolean),
    days,
    costSummary: { totalFlightCost: 1200, totalHotelCost: 0, totalTransportCost: 150, totalFoodCost: 300, totalActivitiesCost: 200, totalEstimatedCost: 1850, budget: Number(budget) || 0, budgetUsedPercent: budget ? Math.round((1850 / Number(budget)) * 100) : 0, budgetStatus: 'on_track' },
  };
}

/**
 * Build mock plan (V1)
 */
export function buildMockPlan({ destination, days, currency, language, budget }) {
  const d = Math.max(1, Number(days) || 1);
  const blocks = [
    { key: "morning", time: "07:00–11:00", label: "morning" },
    { key: "lunch", time: "11:00–14:00", label: "lunch" },
    { key: "afternoon", time: "14:00–17:00", label: "afternoon" },
    { key: "dinner", time: "17:00–21:00", label: "dinner" },
    { key: "optional_evening", time: "20:00–23:30", label: "optional evening" },
  ];

  const nameSeeds = {
    morning: ["Museum", "Botanical Garden", "Old Town Walk", "City Park"],
    lunch: ["Famous Diner", "Local Noodle House", "Riverfront Cafe", "Seafood Shack"],
    afternoon: ["Riverwalk", "Observation Deck", "Historic Quarter", "Art District"],
    dinner: ["Steakhouse", "Modern Bistro", "Popular Pizzeria", "Seafood Grill"],
    optional_evening: ["Jazz Club", "Sky Bar", "Night Market", "Rooftop Lounge"],
  };

  const mkOptions = (blockKey) => {
    const seeds = nameSeeds[blockKey] || ["Spot A", "Spot B", "Spot C"]; 
    return [0, 1].map((i) => {
      const name = `${destination} ${seeds[(i) % seeds.length]}`;
      const type =
        blockKey === "lunch" || blockKey === "dinner" ? "restaurant" : blockKey === "optional_evening" ? "bar" : "activity";
      const desc = `A popular ${type} in ${destination} with good reviews.`;
      const dur = blockKey === "dinner" ? 120 : blockKey === "lunch" ? 60 : 90;
      const dist = i === 0 ? "0.5 mi" : "1 mi";
      const transport = i === 0 ? "Walk 8–12 min" : "Taxi 10–15 min";
      const baseCost = type === "restaurant" ? (blockKey === "dinner" ? 45 : 25) : type === "bar" ? 15 : 20;
      return {
        name,
        type,
        description: desc,
        duration_min: dur,
        distance_from_previous: dist,
        transport,
        cost_estimate: { amount: baseCost, currency },
        address: "", // will be resolved on demand
      };
    });
  };

  const daily = Array.from({ length: d }, (_v, idx) => {
    return {
      day: idx + 1,
      title: `Flexible day ${idx + 1}`,
      items: blocks.map((b) => ({ time: b.time, block_type: b.key, label: b.label, options: mkOptions(b.key) })),
    };
  });

  const hotels = [
    {
      name: `${destination} Central Hotel`,
      nightly_price: { amount: 140, currency },
      price_level: "moderate",
      check_in: "15:00",
      reason: `Convenient base for ${destination}.`,
      rating: 4.3,
      amenities: ["Free Wi‑Fi", "On-site restaurant", "Fitness center", "24/7 front desk"],
    },
    {
      name: `${destination} Budget Inn`,
      nightly_price: { amount: 90, currency },
      price_level: "low",
      check_in: "15:00",
      reason: `Affordable choice near transit in ${destination}.`,
      rating: 3.9,
      amenities: ["Free Wi‑Fi", "Complimentary breakfast", "Front desk"],
    },
    {
      name: `${destination} Boutique View`,
      nightly_price: { amount: 190, currency },
      price_level: "high",
      check_in: "15:00",
      reason: `Stylish boutique hotel with views in ${destination}.`,
      rating: 4.6,
      amenities: ["Free Wi‑Fi", "Bar & lounge", "Fitness center"],
    },
  ];

  const tips = [
    "Use cash/card as accepted locally.",
    "Check the weather and pack layers.",
    "Book popular restaurants in advance.",
  ];

  const plan = {
    destination,
    days: d,
    summary: `A ${d}-day plan in ${destination} (fallback mock).`,
    daily,
    hotels,
    tips,
    meta: {
      generated_at: new Date().toISOString(),
      language,
      currency,
    },
    budget: Number(budget) ? { amount: Number(budget), currency } : undefined,
  };

  return plan;
}

