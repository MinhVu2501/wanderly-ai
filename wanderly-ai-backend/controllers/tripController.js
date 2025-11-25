// controllers/tripController.js
import "dotenv/config";
import {
  generateJsonFromGroq,
  repairJsonWithGroq,
  sanitizePotentialJson,
  buildTripPrompt,
  buildTripSkeletonPromptV3,
  buildTripRealFillPromptV3,
  normalizeSkeletonToSixBlocks,
  postProcessPlan,
  postProcessTripV3,
  enforceUniquePlaces,
  buildMockPlan,
  buildTripPlanV3Mock,
  llamaMicroFill,
} from "./trip/index.js";

/**
 * POST /api/trip-plan (V1)
 */
export async function createTripPlan(req, res) {
  try {
    const {
      destination = "",
      days = 3,
      interests = [],
      travelStyle = "balanced",
      budget = "",
      currency = "USD",
      language = "en",
    } = req.body ?? {};

    if (!destination || !days) {
      return res
        .status(400)
        .json({ error: "Destination and days are required." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res
        .status(500)
        .json({ error: "Missing GROQ_API_KEY in .env" });
    }

    const prompt = buildTripPrompt({
      destination,
      days,
      interests,
      travelStyle,
      budget,
      currency,
      language,
    });

    const raw = await generateJsonFromGroq(prompt);

    if (!raw) {
      return res.json({
        plan: buildMockPlan({
          destination,
          days,
          currency,
          language,
          budget,
        }),
        mock: true,
      });
    }

    let plan;
    try {
      plan = JSON.parse(raw);
    } catch {
      console.warn("JSON parse failed → trying sanitizer");
      const cleaned = sanitizePotentialJson(raw);
      try {
        plan = JSON.parse(cleaned);
      } catch (e2) {
        console.warn("Sanitizer failed → attempting Groq JSON repair");
        try {
          const repaired = await repairJsonWithGroq(raw);
          const repairedClean = sanitizePotentialJson(repaired);
          plan = JSON.parse(repairedClean || repaired);
        } catch (e3) {
          console.warn("JSON repair failed → fallback mock");
          return res.json({
            plan: buildMockPlan({
              destination,
              days,
              currency,
              language,
              budget,
            }),
            mock: true,
          });
        }
      }
    }

    plan = postProcessPlan(plan, {
      destination,
      currency,
      days,
      budget,
    });

    return res.json({ plan, mock: false });
  } catch (err) {
    console.error("createTripPlan ERROR:", err);
    return res
      .status(500)
      .json({ error: "Failed to generate trip plan." });
  }
}

// Alias to preserve old behavior
export async function createTripPlanV1(req, res) {
  return createTripPlan(req, res);
}

/**
 * POST /api/trip-plan-v3
 * Two-stage pipeline:
 *  - Stage 1: GPT-OSS 20B builds skeleton
 *  - Stage 2: Llama 3.3 70B fills with real places + costs
 */
export async function createTripPlanV3(req, res) {
  try {
    const {
      from = "",
      to = "",
      startDate = "",
      endDate = "",
      travelType = "comfort",
      transportPreference = "mixed",
      budget = "",
      language = "en",
      hotelPerDay = [],
    } = req.body ?? {};

    if (!from || !to || !startDate || !endDate) {
      return res.status(400).json({
        error:
          "Fields 'from', 'to', 'startDate', and 'endDate' are required.",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res
        .status(500)
        .json({ error: "Missing GROQ_API_KEY in .env" });
    }

    // -----------------------------
    // 1) SKELETON with GPT-OSS 20B
    // -----------------------------
    const skeletonPrompt = buildTripSkeletonPromptV3({
      from,
      to,
      startDate,
      endDate,
      travelType,
      transportPreference,
      budget,
      language,
      hotelPerDay,
    });

    let skeletonRaw = await generateJsonFromGroq(skeletonPrompt, {
      model: "openai/gpt-oss-20b",
    });

    let skeleton;
    try {
      skeleton = skeletonRaw
        ? JSON.parse(
            typeof skeletonRaw === "string"
              ? skeletonRaw
              : String(skeletonRaw)
          )
        : null;
    } catch (e1) {
      // Silent fallback - try sanitizer first
      try {
        const cleaned = sanitizePotentialJson(String(skeletonRaw || ""));
        if (cleaned) {
          skeleton = JSON.parse(cleaned);
        }
      } catch (e2) {
        // Try JSON repair
        try {
          const repaired = await repairJsonWithGroq(
            String(skeletonRaw || "")
          );
          if (repaired && repaired.trim()) {
            const repairedClean = sanitizePotentialJson(repaired);
            if (repairedClean) {
              skeleton = JSON.parse(repairedClean);
            }
          }
        } catch (e3) {
          // Silent fallback - use mock skeleton
        }
      }
      
      // If still no valid skeleton, use mock
      if (!skeleton || !Array.isArray(skeleton?.days) || !skeleton.days.length) {
        skeleton = buildTripPlanV3Mock({
          from,
          to,
          startDate,
          endDate,
          travelType,
          transportPreference,
          budget,
          language,
          hotelPerDay,
        });
      }
    }

    if (!skeleton || !Array.isArray(skeleton?.days) || !skeleton.days.length) {
      skeleton = buildTripPlanV3Mock({
        from,
        to,
        startDate,
        endDate,
        travelType,
        transportPreference,
        budget,
        language,
        hotelPerDay,
      });
    }

    // Normalise to 8 blocks per day (morning → late_night)
    try {
      skeleton = normalizeSkeletonToSixBlocks(skeleton, hotelPerDay);
    } catch (eNorm) {
      // Silent fallback - keep original skeleton if normalization fails
    }

    // Fix hotels: prioritize user-selected hotels (hotelPerDay) and fix incorrect addresses
    if (hotelPerDay && Array.isArray(hotelPerDay) && hotelPerDay.length > 0) {
      // If user has selected hotels, use those exclusively
      skeleton.hotels = hotelPerDay;
    } else if (skeleton?.hotels && Array.isArray(skeleton.hotels)) {
      // Otherwise, fix any hotels with incorrect addresses
      skeleton.hotels = skeleton.hotels.map(hotel => {
        if (!hotel?.address) return hotel;
        const address = String(hotel.address || '').trim();
        const tokyoNeighborhoods = ['shinjuku', 'shibuya', 'ginza', 'roppongi', 'asakusa', 'akihabara'];
        const hasTokyoNeighborhood = tokyoNeighborhoods.some(neighborhood => 
          address.toLowerCase().includes(neighborhood)
        );
        
        if (hasTokyoNeighborhood && !to.toLowerCase().includes('tokyo') && !to.toLowerCase().includes('japan')) {
          // Clean up address - remove Tokyo neighborhood, replace with destination
          let fixedAddress = address;
          tokyoNeighborhoods.forEach(nh => {
            fixedAddress = fixedAddress.replace(new RegExp(nh + '\\s*area', 'gi'), '');
            fixedAddress = fixedAddress.replace(new RegExp(nh, 'gi'), '');
          });
          fixedAddress = fixedAddress.replace(/area,\s*[^,]+/gi, to.split(',')[0].trim());
          fixedAddress = fixedAddress.replace(/\s*,\s*,\s*/g, ',').replace(/^,\s*|\s*,$/g, '').trim();
          return { ...hotel, address: fixedAddress || to };
        }
        return hotel;
      });
    }

    // Fix hotels in days array as well
    if (skeleton?.days && Array.isArray(skeleton.days)) {
      skeleton.days.forEach(day => {
        if (day?.hotel?.address) {
          const address = String(day.hotel.address || '').trim();
          const tokyoNeighborhoods = ['shinjuku', 'shibuya', 'ginza', 'roppongi', 'asakusa', 'akihabara'];
          const hasTokyoNeighborhood = tokyoNeighborhoods.some(neighborhood => 
            address.toLowerCase().includes(neighborhood)
          );
          
          if (hasTokyoNeighborhood && !to.toLowerCase().includes('tokyo') && !to.toLowerCase().includes('japan')) {
            let fixedAddress = address;
            tokyoNeighborhoods.forEach(nh => {
              fixedAddress = fixedAddress.replace(new RegExp(nh, 'gi'), to.split(',')[0].trim());
            });
            fixedAddress = fixedAddress.replace(/area,\s*[^,]+/gi, to.split(',')[0].trim());
            day.hotel = { ...day.hotel, address: fixedAddress || to };
          }
        }
      });
    }

    // -----------------------------------------------------
    // 2) REAL CONTENT FILLING with LLAMA 3.3-70B Versatile
    // -----------------------------------------------------
    const realFillPrompt = buildTripRealFillPromptV3({
  from,
  to,
  startDate,
  endDate,
  travelType,
  transportPreference,
  budget,
  language,
  hotelPerDay,
  skeleton,
    });

    const raw = await generateJsonFromGroq(realFillPrompt); // default model is llama-3.3-70b-versatile

    let llamaData;
    try {
      llamaData = raw
        ? typeof raw === "string"
          ? JSON.parse(raw)
          : raw
        : null;
    } catch (err) {
      try {
        const cleaned = sanitizePotentialJson(String(raw || ""));
        llamaData = cleaned ? JSON.parse(cleaned) : null;
      } catch (e2) {
        llamaData = null;
      }
    }

    // Merge Llama-filled options into GPT-OSS skeleton structure
    // Preserve GPT-OSS format for: hotels, skeleton structure, flight, travelStyle, costSummary
    // Use Llama format only for: block.options (activities/places)
    let data = { ...skeleton }; // Start with GPT-OSS skeleton

    if (llamaData && Array.isArray(llamaData.days)) {
      // Merge Llama-filled options into skeleton days
      data.days = skeleton.days.map((skeletonDay, dayIdx) => {
        const llamaDay = llamaData.days[dayIdx];
        if (!llamaDay) return skeletonDay;

        // Preserve skeleton hotel structure, merge only block options
        const mergedDay = {
          ...skeletonDay, // Keep GPT-OSS structure (hotel, date, etc.)
          blocks: skeletonDay.blocks.map((skeletonBlock, blockIdx) => {
            const llamaBlock = llamaDay.blocks?.[blockIdx];
            if (!llamaBlock || !Array.isArray(llamaBlock.options)) {
              return skeletonBlock; // Keep skeleton block if Llama didn't fill it
            }

            // Merge: keep skeleton block structure, use Llama options
    return {
              ...skeletonBlock, // Keep GPT-OSS block structure (time, section)
              options: llamaBlock.options, // Use Llama-filled options
            };
          }),
        };

        // Preserve skeleton hotel if it exists, don't let Llama overwrite it
        if (skeletonDay.hotel) {
          mergedDay.hotel = skeletonDay.hotel;
        }

        return mergedDay;
      });

      // Preserve GPT-OSS hotels array - don't let Llama overwrite it
      if (skeleton.hotels && Array.isArray(skeleton.hotels)) {
        data.hotels = skeleton.hotels;
      }

      // Preserve GPT-OSS flight and travelStyle
      if (skeleton.flight) data.flight = skeleton.flight;
      if (skeleton.travelStyle) data.travelStyle = skeleton.travelStyle;

      // Use Llama costSummary if it exists, otherwise keep skeleton
      if (llamaData.costSummary) {
        data.costSummary = llamaData.costSummary;
      } else if (skeleton.costSummary) {
        data.costSummary = skeleton.costSummary;
      }
    }

    // ---------------------------------------
    // 3) Post-process & de-duplicate places
    // ---------------------------------------

    // Attach destination and travel type so nightlife logic & micro-fill know the city and travel style
    if (!data.destination) data.destination = to;
    if (!data.to) data.to = to;
    if (!data.travelType && travelType) {
      data.travelType = travelType;
      if (!data.travelStyle) data.travelStyle = { type: travelType, level: travelType };
    }

    const processed = await postProcessTripV3(data);
    
    // DEBUG: Log after post-processing
    console.log("\n=== AFTER POST-PROCESS ===");
    if (processed?.days) {
      processed.days.forEach((day, di) => {
        console.log(`Day ${di + 1}:`);
        if (Array.isArray(day.blocks)) {
          day.blocks.forEach((block, bi) => {
            const optCount = Array.isArray(block.options) ? block.options.length : 0;
            console.log(`  Block ${bi + 1} (${block.section}): ${optCount} options`);
          });
        }
      });
    }
    console.log("=== END AFTER POST-PROCESS ===\n");
    
    const deduped = enforceUniquePlaces(processed);
    
    // DEBUG: Log after deduplication
    console.log("\n=== AFTER DEDUPLICATION ===");
    if (deduped?.days) {
      deduped.days.forEach((day, di) => {
        console.log(`Day ${di + 1}:`);
        if (Array.isArray(day.blocks)) {
          day.blocks.forEach((block, bi) => {
            const optCount = Array.isArray(block.options) ? block.options.length : 0;
            const status = optCount > 0 ? "✅" : "❌ EMPTY";
            console.log(`  ${status} Block ${bi + 1} (${block.section}): ${optCount} options`);
          });
        }
      });
    }
    console.log("=== END AFTER DEDUPLICATION ===\n");
    
    await ensureMinimumOptionsAfterDedup({
      trip: deduped,
      travelType,
    });

    return res.json({
      plan: deduped,
      mock: false,
    });
  } catch (err) {
    console.error("Error in createTripPlanV3:", err);
    try {
      const {
        from = "",
        to = "",
        startDate = "",
        endDate = "",
        travelType = "comfort",
        transportPreference = "mixed",
        budget = "",
        language = "en",
        hotelPerDay = [],
      } = req.body ?? {};

      const mock = buildTripPlanV3Mock({
        from,
        to,
        startDate,
        endDate,
        travelType,
        transportPreference,
        budget,
        language,
        hotelPerDay,
      });

      return res.json(mock);
    } catch {
      return res
        .status(500)
        .json({ error: "Failed to generate trip plan V3." });
    }
  }
}

async function ensureMinimumOptionsAfterDedup({ trip, travelType }) {
  if (!trip || !Array.isArray(trip.days)) return;

  const tripDestination = trip.to || trip.destination || "city";
  const finalTravelType =
    trip.travelStyle?.level ||
    trip.travelStyle?.type ||
    trip.travelType ||
    travelType ||
    "";

  for (const day of trip.days) {
    if (!Array.isArray(day.blocks)) continue;

    for (const block of day.blocks) {
      if (!Array.isArray(block.options)) block.options = [];

      let attempts = 0;
      while (block.options.length < 2 && attempts < 3) {
        attempts += 1;
        const hotel = day.hotel || {};
        const destination = tripDestination;

        const additional = await llamaMicroFill(
          destination,
          block.section,
          block.time || "",
          hotel,
          block.options,
          finalTravelType
        );

        if (additional && additional.length > 0) {
          const existingNames = new Set(
            block.options
              .map((o) => o?.name?.trim().toLowerCase())
              .filter(Boolean)
          );

          for (const opt of additional) {
            if (block.options.length >= 2) break;
            if (!opt || !opt.name) continue;

            const optName = opt.name.trim().toLowerCase();
            if (existingNames.has(optName)) continue;
            if (optName.includes("suggested") || optName.includes("placeholder"))
              continue;

            if (!opt.address || opt.address.trim().length < 3) {
              opt.address = hotel.address || destination || "City";
            }

            existingNames.add(optName);
            block.options.push(opt);
          }
        }

        if (block.options.length < 2 && attempts < 3) {
          await wait(250);
        }
      }

      if (block.options.length === 0) {
        const sectionName = (block.section || "activity").toUpperCase();
        block.options.push({
          name: `${sectionName} Activity in ${tripDestination}`,
          type:
            block.section === "dinner" || block.section === "lunch"
              ? "restaurant"
              : "activity",
          description: `Explore ${block.section || "this time"} options in ${tripDestination}.`,
          address: day.hotel?.address || tripDestination,
          lat: day.hotel?.lat || 0,
          lng: day.hotel?.lng || 0,
          distanceFromPrevious: "0.5 km",
          transport: "walk",
          estimatedCost: 0,
          rating: 4.0,
          label: "Explore",
          tags: [block.section || "activity"],
        });
      } else if (block.options.length === 1) {
        const first = block.options[0];
        const altName = first?.name
          ? `${first.name} (Alternative)`
          : "Alternative Option";
        block.options.push({
          ...first,
          name: altName,
          label: first?.label || "Alternative Option",
        });
      }
    }
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
