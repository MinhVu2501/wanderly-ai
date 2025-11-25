
import { generateJsonFromGroq } from "../groqClient.js";
import { sanitizePotentialJson } from "../sanitizer.js";


export async function llamaMicroFill(
  destination,
  blockType,
  blockTime,
  hotel,
  existingOptions = [],
  travelType = ""
) {
  const existingNames = existingOptions
    .map((o) => o?.name?.toLowerCase().trim())
    .filter(Boolean);

  // We usually want 2–4 options total; ask for 3 new ones at a time
  const needed = Math.max(2, 3 - existingOptions.length);

  // Determine type based on block type
  const blockTypeLower = String(blockType || "").toLowerCase();
  const isEvening = blockTypeLower === "evening";
  const isDinner = blockTypeLower === "dinner";
  const isLunch = blockTypeLower === "lunch";
  const isNight = blockTypeLower === "night" || blockTypeLower === "late_night";
  
  const travelTypeLower = String(travelType || "").toLowerCase();
  const isLuxury = travelTypeLower.includes("luxury") || travelTypeLower === "high";
  const isBudget = travelTypeLower.includes("budget") || travelTypeLower === "low";
  
  let typeGuidance = "restaurants, cafes, museums, parks, viewpoints, bars, activities";
  let priceGuidance = "";
  
  if (isEvening) {
    typeGuidance = "activities, attractions, viewpoints, parks, shopping areas, cultural sites (NOT restaurants)";
  } else if (isDinner || isLunch) {
    typeGuidance = "restaurants only";
    if (isLuxury) {
      priceGuidance = `
PRICING FOR LUXURY RESTAURANTS:
- Fine dining restaurants: $150-400+ per person
- Michelin-starred restaurants: $250-500+ per person
- Examples: Alinea, Ever, Oriole, Kasama, Indienne, Smyth, Moody Tongue
- Must be high-end, acclaimed, upscale restaurants with tasting menus or prix-fixe options
- NO casual dining, NO diners, NO budget options`;
    } else if (isBudget) {
      priceGuidance = `
PRICING FOR BUDGET RESTAURANTS:
- Casual restaurants: $10-30 per person
- Street food, food trucks, casual diners, affordable local spots`;
    } else {
      priceGuidance = `
PRICING FOR MODERATE RESTAURANTS:
- Mid-range restaurants: $30-100 per person
- Good quality restaurants with a la carte menus`;
    }
  } else if (isNight) {
    typeGuidance = "nightlife activities, bars, speakeasies, live music venues (NOT dinner restaurants)";
    if (isLuxury) {
      priceGuidance = "- High-end cocktail bars, rooftop lounges, exclusive nightlife venues";
    }
  }
  
  const microPrompt = `
Give me ${needed} REAL, VERIFIED places for "${blockType}" in ${destination}.
Travel Type: ${travelType || "moderate"}
${priceGuidance}
Rules:
- NO placeholders, NO "Suggested Activity", NO fake names.
- Do NOT repeat any of these names: ${existingNames.join(", ") || "none"}.
- Only real ${typeGuidance}.
${isLuxury && (isDinner || isLunch) ? "- For luxury trips, ONLY suggest Michelin-starred, fine dining, or high-end acclaimed restaurants (examples: Alinea, Ever, Oriole, Kasama, Smyth). NO casual restaurants." : ""}

Return STRICT JSON only, exactly in this shape:

{
  "options": [
    {
      "name": "string",
      "type": "string",
      "description": "1 sentence max, no new lines",
      "address": "string",
      "lat": 0,
      "lng": 0,
      "distanceFromPrevious": "0.4 mi",
      "transport": "walk",
      "estimatedCost": 15,
      "famousFor": "string",
      "whatToDo": "string",
      "mustTryDish": "string",
      "recommendedDrink": "string",
      "tip": "string",
      "rating": 4.5,
      "label": "Top Pick",
      "tags": ["string"]
    }
  ]
}

Return ONLY JSON, no explanation.
`.trim();

  try {
    const raw = await generateJsonFromGroq(microPrompt, {
      model: "llama-3.3-70b-versatile",
    });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = JSON.parse(sanitizePotentialJson(String(raw || "")));
    }

    // Support both {options:[...]} and bare array formats
    const options = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.options)
      ? parsed.options
      : [];

    const lowerExisting = new Set(existingNames);

    return options.filter((opt) => {
      if (!opt || typeof opt !== "object") return false;
      const name = String(opt.name || "").trim();

      // Only require name - address can be added later
      if (!name || name.length < 2) return false;
      const key = name.toLowerCase();

      // Skip duplicates
      if (lowerExisting.has(key)) return false;
      
      // Skip obvious placeholders
      if (key.includes("suggested activity") || 
          key.includes("placeholder") ||
          key === "free time" ||
          key === "explore nearby") return false;

      return true;
    });
  } catch (err) {
    console.warn("llamaMicroFill failed:", err);
    return [];
  }
}

export async function postProcessTripV3(trip) {
  try {
    if (!trip || !Array.isArray(trip.days)) return trip;
    
    // Get travel type from trip for context (can be in multiple places)
    const travelType = trip.travelStyle?.level || 
                       trip.travelStyle?.type || 
                       trip.travelType || 
                       (trip.travelStyle && typeof trip.travelStyle === 'string' ? trip.travelStyle : "");

    const BLOCK_ORDER = [
      "morning",
      "midday",
      "lunch",
      "afternoon",
      "evening",
      "dinner",
      "night",
      "late_night",
    ];

    const REQUIRED_BLOCKS = [...BLOCK_ORDER];

    const defaultTimeForSection = (sec) => {
      switch (sec) {
        case "morning":
          return "08:00 - 10:30";
        case "midday":
          return "10:45 - 12:00";
        case "lunch":
          return "12:00 - 13:30";
        case "afternoon":
          return "14:00 - 16:30";
        case "evening":
          return "16:30 - 18:30";
        case "dinner":
          return "18:30 - 20:00";
        case "night":
          return "20:00 - 23:30";
        case "late_night":
        default:
          return "23:30 - 03:00";
      }
    };

    // 1) Per-day normalisation + micro-fill
    for (const day of trip.days) {
      if (!Array.isArray(day.blocks)) day.blocks = [];

      // Ensure all required sections exist
      const existingSections = new Set(
        day.blocks.map((b) => String(b.section || "").toLowerCase())
      );

      for (const sec of REQUIRED_BLOCKS) {
        if (!existingSections.has(sec)) {
          day.blocks.push({
            time: defaultTimeForSection(sec),
            section: sec,
            options: [],
          });
        }
      }

      // Clean + fill each block
      for (const block of day.blocks) {
        if (!Array.isArray(block.options)) block.options = [];

        // Normalise section
        block.section = String(block.section || "").toLowerCase();
        if (!BLOCK_ORDER.includes(block.section)) {
          block.section = "morning"; // fallback rather than breaking UI
        }

        // 1. Remove obvious junk / placeholders
        block.options = block.options.filter((opt) => {
          if (!opt || typeof opt !== "object") return false;
          const name = String(opt.name || "").trim();
          if (!name) return false;

          const lower = name.toLowerCase();
          if (lower.includes("suggested activity")) return false;

          return true;
        });

        // 2. Deduplicate by name *inside* this block
        const seenNames = new Set();
        block.options = block.options.filter((opt) => {
          const key = String(opt.name || "").trim().toLowerCase();
          if (!key) return false;
          if (seenNames.has(key)) return false;
          seenNames.add(key);
          return true;
        });

        // 3. If fewer than 2 real options, call micro-fill (keep trying until we have 2+)
        const hotel = day.hotel || {};
        const destination = trip.to || trip.destination || "city";
        let totalAttempts = 0;
        const maxTotalAttempts = 6; // Increased attempts for reliability
        
        while (block.options.length < 2 && totalAttempts < maxTotalAttempts) {
          totalAttempts++;
          
          const added = await llamaMicroFill(
            destination,
            block.section,
            block.time || defaultTimeForSection(block.section),
            hotel,
            block.options,
            travelType
          );

          if (added && added.length > 0) {
            // Add valid options
            for (const opt of added) {
              if (block.options.length >= 4) break; // Max 4 options per block
              if (!opt || !opt.name) continue;
              
              const key = String(opt.name || "").trim().toLowerCase();
              if (!key || key.length < 2) continue;
              
              // Skip if already seen
              if (seenNames.has(key)) continue;
              
              // Skip generic placeholders
              if (key.includes("suggested") || 
                  key.includes("free time") || 
                  key.includes("placeholder") ||
                  key.includes("explore nearby")) {
                continue;
              }
              
              // Ensure minimum fields exist
              if (!opt.address || opt.address.trim().length < 3) {
                opt.address = hotel.address || destination || "City";
              }
              
              // Add option
              seenNames.add(key);
              block.options.push(opt);
            }
          }
          
          // Small delay before next attempt if we still need more options
          if (block.options.length < 2 && totalAttempts < maxTotalAttempts) {
            await new Promise(resolve => setTimeout(resolve, 400));
          }
        }

        // 4. Final per-block dedupe + limit to max 4
        const finalNames = new Set();
        const finalOptions = [];
        for (const opt of block.options) {
          if (!opt || !opt.name) continue;
          const key = String(opt.name).trim().toLowerCase();
          if (!key || finalNames.has(key)) continue;
          finalNames.add(key);
          finalOptions.push(opt);
          if (finalOptions.length >= 4) break;
        }

        block.options = finalOptions;
        
        // Final safety: if still less than 2 options after all processing, keep trying
        let safetyAttempts = 0;
        while (block.options.length < 2 && safetyAttempts < 3) {
          safetyAttempts++;
          
          const lastFill = await llamaMicroFill(
            destination,
            block.section,
            block.time || defaultTimeForSection(block.section),
            hotel,
            block.options,
            travelType
          );
          
          if (lastFill && lastFill.length > 0) {
            const existingKeys = new Set(block.options.map(o => String(o.name || "").trim().toLowerCase()));
            for (const opt of lastFill) {
              if (block.options.length >= 2) break;
              if (!opt || !opt.name) continue;
              
              const key = String(opt.name).trim().toLowerCase();
              if (!key || key.length < 2) continue;
              if (existingKeys.has(key)) continue;
              
              // Be less strict about placeholders in final safety check
              if (key.includes("suggested activity") || key.includes("placeholder")) continue;
              
              // Ensure minimum fields
              if (!opt.address || opt.address.trim().length < 3) {
                opt.address = hotel.address || destination || "City";
              }
              
              existingKeys.add(key);
              block.options.push(opt);
            }
          }
          
          // Small delay between safety attempts
          if (block.options.length < 2 && safetyAttempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        
        // CRITICAL: Ensure block NEVER ends up empty - keep first valid option if all else fails
        if (block.options.length === 0) {
          // Last resort: try to recover any previously filtered options
          let emergencyAttempts = 0;
          while (block.options.length === 0 && emergencyAttempts < 2) {
            emergencyAttempts++;
            const emergencyFill = await llamaMicroFill(
              destination,
              block.section,
              block.time || defaultTimeForSection(block.section),
              hotel,
              [],
              travelType
            );
            
            if (emergencyFill && emergencyFill.length > 0) {
              // Take the first option no matter what, just ensure it has minimum fields
              const first = emergencyFill[0];
              if (first && first.name) {
                if (!first.address) first.address = hotel.address || destination || "City";
                if (!first.lat) first.lat = hotel.lat || 0;
                if (!first.lng) first.lng = hotel.lng || 0;
                block.options.push(first);
                
                // Try to add a second one
                if (emergencyFill.length > 1) {
                  const second = emergencyFill[1];
                  if (second && second.name && second.name.toLowerCase() !== first.name.toLowerCase()) {
                    if (!second.address) second.address = hotel.address || destination || "City";
                    if (!second.lat) second.lat = hotel.lat || 0;
                    if (!second.lng) second.lng = hotel.lng || 0;
                    block.options.push(second);
                  }
                }
                break;
              }
            }
            if (emergencyAttempts < 2) {
              await new Promise(resolve => setTimeout(resolve, 400));
            }
          }
          
          // If still only 1 option, try to add one more
          if (block.options.length === 1) {
            const oneMoreFill = await llamaMicroFill(
              destination,
              block.section,
              block.time || defaultTimeForSection(block.section),
              hotel,
              block.options,
              travelType
            );
            if (oneMoreFill && oneMoreFill.length > 0) {
              const existingName = block.options[0]?.name?.toLowerCase() || "";
              for (const opt of oneMoreFill) {
                if (block.options.length >= 2) break;
                if (!opt || !opt.name) continue;
                const optName = opt.name.toLowerCase();
                if (optName === existingName) continue;
                if (!opt.address) opt.address = hotel.address || destination || "City";
                block.options.push(opt);
              }
            }
          }
          
          // ABSOLUTE LAST RESORT: Create minimal fallback option
          if (block.options.length === 0) {
            const sectionName = (block.section || "").toUpperCase();
            block.options = [{
              name: `${sectionName} Activity in ${destination}`,
              type: block.section === "dinner" || block.section === "lunch" ? "restaurant" : "activity",
              description: `Explore ${block.section} options in ${destination}.`,
              address: hotel.address || destination || "City",
              lat: hotel.lat || 0,
              lng: hotel.lng || 0,
              distanceFromPrevious: "0.5 km",
              transport: "walk",
              estimatedCost: 0,
              rating: 4.0,
              label: "Explore",
              tags: [block.section || "activity"],
            }];
          }
        }
        
        // FINAL CHECK: If block still only has 1 option after all processing, add one more
        if (block.options.length === 1) {
          const finalFill = await llamaMicroFill(
            destination,
            block.section,
            block.time || defaultTimeForSection(block.section),
            hotel,
            block.options,
            travelType
          );
          if (finalFill && finalFill.length > 0) {
            const existingName = block.options[0]?.name?.toLowerCase() || "";
            for (const opt of finalFill) {
              if (block.options.length >= 2) break;
              if (!opt || !opt.name) continue;
              const optName = opt.name.toLowerCase();
              if (optName === existingName) continue;
              if (!opt.address) opt.address = hotel.address || destination || "City";
              block.options.push(opt);
            }
          }
        }
      }

      // 5. Sort blocks into the strict UI order
      day.blocks = day.blocks.sort((a, b) => {
        const ai = BLOCK_ORDER.indexOf(String(a.section || "").toLowerCase());
        const bi = BLOCK_ORDER.indexOf(String(b.section || "").toLowerCase());
        return ai - bi;
      });
    }

    // 2) Optional light global de-duplication across all days
    //    We *never* drop a block to 0 options here.
    const globalSeen = new Set();
    for (const day of trip.days) {
      for (const block of day.blocks || []) {
        if (!Array.isArray(block.options) || block.options.length === 0) {
          // If block has no options, try to fill it multiple times
          const hotel = day.hotel || {};
          const destination = trip.to || trip.destination || "city";
          let emergencyAttempts = 0;
          
          while (block.options.length === 0 && emergencyAttempts < 3) {
            emergencyAttempts++;
            const emergencyFill = await llamaMicroFill(
              destination,
              block.section,
              block.time || defaultTimeForSection(block.section),
              hotel,
              [],
              travelType
            );
            if (emergencyFill && emergencyFill.length > 0) {
              block.options = emergencyFill.slice(0, 2).map(opt => {
                if (!opt.address) opt.address = hotel.address || destination || "City";
                if (!opt.lat) opt.lat = hotel.lat || 0;
                if (!opt.lng) opt.lng = hotel.lng || 0;
                return opt;
              });
              break;
            }
            if (emergencyAttempts < 3) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
          
          // ABSOLUTE LAST RESORT: Create a minimal fallback option
          if (block.options.length === 0) {
            const sectionName = (block.section || "").toUpperCase();
            block.options = [{
              name: `${sectionName} Activity in ${destination}`,
              type: block.section === "dinner" || block.section === "lunch" ? "restaurant" : "activity",
              description: `Explore ${block.section} options in ${destination}.`,
              address: hotel.address || destination || "City",
              lat: hotel.lat || 0,
              lng: hotel.lng || 0,
              distanceFromPrevious: "0.5 km",
              transport: "walk",
              estimatedCost: 0,
              rating: 4.0,
              label: "Explore",
              tags: [block.section || "activity"],
            }];
          }
          continue;
        }

        const newOpts = [];
        for (const opt of block.options) {
          if (!opt?.name) continue;
          const key = String(opt.name).trim().toLowerCase();

          if (!globalSeen.has(key) || newOpts.length === 0) {
            globalSeen.add(key);
            newOpts.push(opt);
          }
        }

        if (newOpts.length === 0) {
          // all were duplicates, keep first to avoid empty UI
          if (block.options.length > 0) {
            newOpts.push(block.options[0]);
          }
        }

        block.options = newOpts.slice(0, 4);
        
        // Final check: if somehow block is empty after dedupe, fill it
        if (block.options.length === 0) {
          const hotel = day.hotel || {};
          const destination = trip.to || trip.destination || "city";
          let emergencyAttempts = 0;
          
          while (block.options.length === 0 && emergencyAttempts < 2) {
            emergencyAttempts++;
            const emergencyFill = await llamaMicroFill(
              destination,
              block.section,
              block.time || defaultTimeForSection(block.section),
              hotel,
              [],
              travelType
            );
            if (emergencyFill && emergencyFill.length > 0) {
              block.options = emergencyFill.slice(0, 2).map(opt => {
                if (!opt.address) opt.address = hotel.address || destination || "City";
                if (!opt.lat) opt.lat = hotel.lat || 0;
                if (!opt.lng) opt.lng = hotel.lng || 0;
                return opt;
              });
              break;
            }
          }
          
          // ABSOLUTE LAST RESORT: Create minimal fallback
          if (block.options.length === 0) {
            const sectionName = (block.section || "").toUpperCase();
            block.options = [{
              name: `${sectionName} Activity in ${destination}`,
              type: block.section === "dinner" || block.section === "lunch" ? "restaurant" : "activity",
              description: `Explore ${block.section} options in ${destination}.`,
              address: hotel.address || destination || "City",
              lat: hotel.lat || 0,
              lng: hotel.lng || 0,
              distanceFromPrevious: "0.5 km",
              transport: "walk",
              estimatedCost: 0,
              rating: 4.0,
              label: "Explore",
              tags: [block.section || "activity"],
            }];
          }
        }
      }
    }

    // FINAL SAFETY CHECK: Ensure absolutely no block is empty before returning
    for (const day of trip.days) {
      if (!Array.isArray(day.blocks)) continue;
      for (const block of day.blocks) {
        if (!Array.isArray(block.options) || block.options.length === 0) {
          // Create minimal fallback - this should never happen, but just in case
          const hotel = day.hotel || {};
          const destination = trip.to || trip.destination || "city";
          const sectionName = (block.section || "").toUpperCase();
          block.options = [{
            name: `${sectionName} Activity in ${destination}`,
            type: block.section === "dinner" || block.section === "lunch" ? "restaurant" : "activity",
            description: `Explore ${block.section} options in ${destination}.`,
            address: hotel.address || destination || "City",
            lat: hotel.lat || 0,
            lng: hotel.lng || 0,
            distanceFromPrevious: "0.5 km",
            transport: "walk",
            estimatedCost: 0,
            rating: 4.0,
            label: "Explore",
            tags: [block.section || "activity"],
          }];
        }
      }
    }

    // DEBUG: Log block options count before returning
    console.log("\n=== POST-PROCESS FINAL CHECK ===");
    for (let di = 0; di < trip.days.length; di++) {
      const day = trip.days[di];
      console.log(`Day ${di + 1} (${day.day || di + 1}):`);
      if (Array.isArray(day.blocks)) {
        day.blocks.forEach((block, bi) => {
          const optCount = Array.isArray(block.options) ? block.options.length : 0;
          const section = block.section || "unknown";
          const status = optCount > 0 ? "✅" : "❌ EMPTY";
          console.log(`  ${status} Block ${bi + 1}: ${section.toUpperCase()} - ${optCount} options`);
          if (optCount > 0 && block.options[0]?.name) {
            console.log(`      First option: ${block.options[0].name}`);
          }
        });
      }
    }
    console.log("=== END POST-PROCESS CHECK ===\n");

    return trip;
  } catch (e) {
    console.warn("postProcessTripV3 failed:", e);
    return trip;
  }
}
