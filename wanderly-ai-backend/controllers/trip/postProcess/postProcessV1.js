/**
 * Post-process plan (V1): normalize, calculate costs, handle hotels
 */
export function postProcessPlan(plan, { destination, currency, days, budget }) {
  if (!plan || typeof plan !== "object") return plan;

  // --- Normalize meta ---
  if (!plan.meta) plan.meta = {};
  plan.meta.generated_at = new Date().toISOString();
  plan.meta.language = plan.meta.language || "en";
  plan.meta.currency = plan.meta.currency || currency || "USD";

  // Attach budget into plan.meta/plan.budget for reference
  const numericBudgetFromInput = Number(budget);
  if (!Number.isNaN(numericBudgetFromInput) && numericBudgetFromInput > 0) {
    if (!plan.budget) {
      plan.budget = {
        amount: numericBudgetFromInput,
        currency: plan.meta.currency,
      };
    }
  }

  const cur = plan.meta.currency;
  const targetDays = Number(plan.days || days || 0);

  // --- Ensure daily exists & has correct number of days ---
  if (!Array.isArray(plan.daily)) plan.daily = [];

  if (targetDays > 0) {
    // Pad missing days by cloning last day (better than nothing)
    while (plan.daily.length < targetDays) {
      const idx = plan.daily.length;
      const last = plan.daily[idx - 1];

      const valid = last && Array.isArray(last.items) && last.items.length === 5;

      let next;

      if (valid) {
        next = JSON.parse(JSON.stringify(last));
        next.day = idx + 1;
        next.title = `Flexible day ${next.day}`;
      } else {
        next = {
          day: idx + 1,
          title: `Flexible day ${idx + 1}`,
          items: [
            { block_type: "morning", time: "07:00–11:00", label: "morning", options: [] },
            { block_type: "lunch", time: "11:00–14:00", label: "lunch", options: [] },
            { block_type: "afternoon", time: "14:00–17:00", label: "afternoon", options: [] },
            { block_type: "dinner", time: "17:00–21:00", label: "dinner", options: [] },
            { block_type: "optional_evening", time: "20:00–23:30", label: "optional evening", options: [] },
          ],
        };
      }

      plan.daily.push(next);
    }

    // Trim extra days if Groq returned too many
    if (plan.daily.length > targetDays) {
      plan.daily = plan.daily.slice(0, targetDays);
    }

    plan.days = targetDays;
  }

  // --- Helpers for transport + realistic costs ---
  const deriveTransport = (distanceStr, blockType) => {
    const d = parseFloat(String(distanceStr || "").replace(",", ".")) || 0;
    const distUnit = /km/i.test(distanceStr || "") ? "km" : "miles";

    if (d === 0) return "Walk (same location or very close)";

    if (distUnit === "miles") {
      if (d <= 0.6) return "Walk 5–10 minutes (best option)";
      if (d <= 2) return "Walk or short public transit ride";
      if (d <= 5) return "Taxi/Uber or public transit ~10–20 minutes";
      return "Taxi/Uber ~20–30 minutes";
    } else {
      // km
      if (d <= 1) return "Walk 10–15 minutes (best option)";
      if (d <= 3) return "Walk or short public transit ride";
      if (d <= 8) return "Taxi/Uber or public transit ~10–25 minutes";
      return "Taxi/Uber ~20–30 minutes";
    }
  };

  const baseCostForType = (optType, blockType) => {
    const t = (optType || "").toLowerCase();

    if (t.includes("cafe") || t.includes("coffee") || t.includes("bakery")) {
      return 12; // casual drink/snack
    }
    if (t.includes("restaurant") || t.includes("bistro") || blockType === "dinner") {
      return 40; // decent sit-down meal
    }
    if (blockType === "lunch") {
      return 25;
    }
    if (t.includes("museum") || t.includes("gallery")) {
      return 25; // typical Chicago museum ticket
    }
    if (t.includes("tour") || t.includes("cruise")) {
      return 60; // boat tours, guided tours
    }
    if (t.includes("bar") || t.includes("lounge")) {
      return 30;
    }

    return 20; // generic attraction
  };

  const costRangeForType = (optType, blockType) => {
    const t = (optType || "").toLowerCase();

    if (t.includes("cafe") || t.includes("coffee") || t.includes("bakery")) {
      return [5, 25];
    }
    if (t.includes("restaurant") || t.includes("bistro") || blockType === "dinner") {
      return [15, 120]; // cheap diner → fancy tasting menu
    }
    if (blockType === "lunch") {
      return [10, 50];
    }
    if (t.includes("museum") || t.includes("gallery")) {
      return [10, 40]; // e.g. Field Museum 26–30
    }
    if (t.includes("tour") || t.includes("cruise")) {
      return [30, 200];
    }
    if (t.includes("bar") || t.includes("lounge")) {
      return [15, 80];
    }
    return [10, 80];
  };

  // --- Normalize day blocks + option details ---
  for (const day of plan.daily || []) {
    // Some Groq outputs may use morning/lunch/afternoon keys => normalize
    if (!Array.isArray(day.items) || day.items.length === 0) {
      const blocks = [];
      for (const key of ["morning", "lunch", "afternoon", "dinner", "optional_evening"]) {
        const arr = Array.isArray(day[key]) ? day[key] : null;
        if (!arr || arr.length === 0) continue;

        const timeMap = {
          morning: "07:00–11:00",
          lunch: "11:00–14:00",
          afternoon: "14:00–17:00",
          dinner: "17:00–21:00",
          optional_evening: "20:00–23:30",
        };

        blocks.push({
          time: timeMap[key] || "",
          block_type: key,
          label: key.replace("_", " "),
          options: arr,
        });

        delete day[key]; // drop raw arrays
      }
      if (blocks.length > 0) {
        day.items = blocks;
      }
    }

    // FOR ALL DAYS — ensure 2–4 options for every block
    day.items = day.items.map((block) => {
      const opts = block.options || [];

      // If AI provided only 1 option → duplicate to force model to fill it
      if (opts.length < 2) {
        const base = opts[0] || {};

        // Create 2 placeholder options so the real-fill stage overwrites them
        const filler = {
          name: "",
          type: block.block_type || "",
          description: "",
          address: "",
          distance_from_previous: "",
          duration_min: "",
          transport: "",
          cost_estimate: { amount: 0, currency: plan.meta?.currency || "USD" }
        };

        block.options = [ base, filler ];
      }

      // If more than 4 options, keep max 4
      if (block.options.length > 4) {
        block.options = block.options.slice(0, 4);
      }

      return block;
    });

    for (const block of day.items || []) {
      const blockType = (block.block_type || "").toLowerCase();

      for (const opt of block.options || []) {
        // --- Duration sane defaults ---
        if (!opt.duration_min) {
          if (blockType === "lunch") opt.duration_min = 60;
          else if (blockType === "dinner") opt.duration_min = 90;
          else if (blockType === "afternoon" || blockType === "morning") opt.duration_min = 90;
          else opt.duration_min = 60;
        }

        // --- Transport best guess if missing ---
        if (!opt.transport || !opt.transport.trim()) {
          opt.transport = deriveTransport(opt.distance_from_previous, blockType);
        }

        // --- Cost: realistic, NOT over-scaled ---
        const t = opt.type || "";
        const base = baseCostForType(t, blockType);
        const [minCost, maxCost] = costRangeForType(t, blockType);

        if (!opt.cost_estimate || opt.cost_estimate.amount == null) {
          let amount = base;
          amount = Math.max(minCost, Math.min(maxCost, amount));
          amount = Math.round(amount / 5) * 5;

          opt.cost_estimate = {
            amount,
            currency: cur,
          };
        } else {
          let amount = Number(opt.cost_estimate.amount);

          if (!Number.isFinite(amount)) {
            amount = base;
          }

          // If model gave something crazy (like 1260), clamp to sensible range
          if (amount < minCost || amount > maxCost) {
            amount = Math.max(minCost, Math.min(maxCost, amount));
          }

          amount = Math.round(amount / 5) * 5;

          opt.cost_estimate = {
            amount,
            currency: opt.cost_estimate.currency || cur,
          };
        }

        // --- Fix missing unit in distance_from_previous ---
        if (opt.distance_from_previous && typeof opt.distance_from_previous === "number") {
          opt.distance_from_previous = `${opt.distance_from_previous} mi`;
        }
        if (typeof opt.distance_from_previous === "string") {
          const d = opt.distance_from_previous.trim();
          if (/^\d+(?:\.\d+)?$/.test(d)) {
            opt.distance_from_previous = `${d} mi`;
          }
        }
      }
    }
  }

  /* -----------------------------------------------
   * BUDGET SCALING (soft scaling, 0.7–1.6 range)
   * --------------------------------------------- */
  try {
    const totalDays = plan.days || 1;
    const tripBudget = Number(plan.budget?.amount || 0);

    if (tripBudget > 0) {
      // Estimate sensible per-day cost
      const targetPerDay = tripBudget / totalDays;

      // Compute current per-day cost
      let actualPerDay = 0;
      let count = 0;

      for (const day of plan.daily) {
        for (const block of (day.items || [])) {
          for (const opt of (block.options || [])) {
            const amt = Number(opt.cost_estimate?.amount || 0);
            if (amt > 0) {
              actualPerDay += amt;
              count++;
            }
          }
        }
      }

      if (count > 0) {
        const basePerDay = actualPerDay / count;
        let scale = basePerDay > 0 ? targetPerDay / basePerDay : 1;

        // Soft limits so costs never explode
        scale = Math.max(0.7, Math.min(1.6, scale));

        for (const day of plan.daily) {
          for (const block of day.items || []) {
            for (const opt of block.options || []) {
              const amt = Number(opt.cost_estimate?.amount || 0);
              if (amt > 0) {
                const scaled = Math.round(amt * scale);
                opt.cost_estimate.amount = scaled;
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.log("Soft scaling error:", e);
  }

  /* ==========================================================
   * HOTELS — budget scaling + ratings & amenities
   * ======================================================== */
  const numericBudget =
    (!Number.isNaN(numericBudgetFromInput) && numericBudgetFromInput) ||
    Number(plan.budget?.amount) ||
    0;

  const nights = targetDays || 1;
  let perNightTarget = 0;
  if (numericBudget > 0 && nights > 0) {
    // Assume ~40% of total trip budget goes to lodging
    perNightTarget = (numericBudget * 0.4) / nights;
  }

  // Ensure we have 3–4 hotels
  if (!Array.isArray(plan.hotels) || plan.hotels.length === 0) {
    plan.hotels = [
      {
        name: `Central Hotel ${destination}`,
        nightly_price: { amount: 140, currency: cur },
        price_level: "moderate",
        check_in: "15:00",
        reason: `Good location for exploring ${destination}.`,
      },
      {
        name: `Budget Stay ${destination}`,
        nightly_price: { amount: 90, currency: cur },
        price_level: "low",
        check_in: "15:00",
        reason: `Budget-friendly, clean rooms with easy transit around ${destination}.`,
      },
      {
        name: `Boutique View ${destination}`,
        nightly_price: { amount: 190, currency: cur },
        price_level: "high",
        check_in: "15:00",
        reason: `Stylish boutique hotel with great reviews and atmosphere in ${destination}.`,
      },
      {
        name: `Family Suites ${destination}`,
        nightly_price: { amount: 150, currency: cur },
        price_level: "moderate",
        check_in: "15:00",
        reason: `Spacious rooms and family-friendly amenities, convenient for exploring ${destination}.`,
      },
    ];
  }

  for (const h of plan.hotels) {
    const level = String(h.price_level || "moderate").toLowerCase();

    // --- Determine realistic range + multiplier by level ---
    let min = 80;
    let max = 220;
    let mult = 1.0;

    if (level === "low") {
      min = 50;
      max = 150;
      mult = 0.7;
    } else if (level === "high") {
      min = 180;
      max = 400;
      mult = 1.4;
    } else if (level === "luxury") {
      min = 250;
      max = 600;
      mult = 1.8;
    }

    // --- Compute nightly price with budget in mind ---
    let amount;

    if (perNightTarget > 0) {
      amount = perNightTarget * mult;
    } else if (h.nightly_price && h.nightly_price.amount != null) {
      amount = Number(h.nightly_price.amount);
    } else {
      amount = (min + max) / 2;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      amount = (min + max) / 2;
    }

    amount = Math.max(min, Math.min(max, amount));
    amount = Math.round(amount / 10) * 10;

    h.nightly_price = {
      amount,
      currency: h.nightly_price?.currency || cur,
    };

    // --- Ratings ---
    if (!h.rating) {
      if (level === "low") h.rating = 3.8;
      else if (level === "high" || level === "luxury") h.rating = 4.6;
      else h.rating = 4.3;
    }

    // --- Amenities ---
    if (!Array.isArray(h.amenities) || h.amenities.length === 0) {
      if (/family/i.test(h.name)) {
        h.amenities = [
          "Free Wi-Fi",
          "Complimentary breakfast",
          "Family rooms",
          "Cribs available on request",
          "On-site parking",
        ];
      } else if (level === "low") {
        h.amenities = [
          "Free Wi-Fi",
          "Complimentary breakfast",
          "24/7 front desk",
        ];
      } else if (level === "high" || level === "luxury") {
        h.amenities = [
          "Free Wi-Fi",
          "On-site restaurant & bar",
          "Fitness center",
          "Spa / wellness services",
          "Concierge service",
          "City views",
        ];
      } else {
        // moderate
        h.amenities = [
          "Free Wi-Fi",
          "On-site restaurant",
          "Fitness center",
          "24/7 front desk",
        ];
      }
    }

    if (!h.check_in) {
      h.check_in = "15:00";
    }

    if (!h.reason) {
      h.reason = `Good base for exploring ${destination}.`;
    }
  }

  return plan;
}

