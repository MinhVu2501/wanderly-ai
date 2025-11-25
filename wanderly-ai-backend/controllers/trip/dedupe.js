export function enforceUniquePlaces(trip) {
  try {
    if (!trip || !Array.isArray(trip.days)) return trip;

    // PER-DAY deduplication to allow same place on different days, but not same day
    trip.days.forEach((day) => {
      if (!Array.isArray(day.blocks)) return;
      
      // Track seen places within THIS day only
      const DAY_SEEN = new Set();

      day.blocks.forEach((block) => {
        if (!Array.isArray(block.options)) block.options = [];

        const newOptions = [];
        const BLOCK_SEEN = new Set(); // Track within this block too

        block.options.forEach((opt) => {
          if (!opt || !opt.name) return;

          // Normalize name
          const cleanName = opt.name.trim().toLowerCase();

          // Block-level dedupe: skip exact duplicates within same block
          if (BLOCK_SEEN.has(cleanName)) {
            return;
          }
          
          BLOCK_SEEN.add(cleanName);

          // Day-level dedupe: skip if same place already appeared in this day
          if (DAY_SEEN.has(cleanName)) {
            // But keep duplicates if block would have less than 2 options
            // This ensures we always have enough options
            if (newOptions.length < 2) {
              newOptions.push(opt);
            }
            return;
          }

          // Keep the place and mark as seen for this day
          DAY_SEEN.add(cleanName);
          newOptions.push(opt);
        });

        // CRITICAL: Ensure block always has at least one option
        if (newOptions.length === 0) {
          if (block.options.length > 0) {
            // Keep the first option even if it's a duplicate
            newOptions.push(block.options[0]);
          } else {
            // If block had no options to begin with, this shouldn't happen after postProcessV3
            // But create a fallback just in case
            console.warn(`⚠️ Block ${block.section} in day ${day.day || 'unknown'} is empty after deduplication!`);
            const destination = trip.to || trip.destination || "city";
            const hotel = day.hotel || {};
            const sectionName = (block.section || "").toUpperCase();
            newOptions.push({
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
            });
          }
        }

        block.options = newOptions;
        
        // ENSURE: Block has at least 2 options (after deduplication)
        // If only 1, add a note that we need more options
        if (block.options.length === 1 && block.options[0].name.includes("Activity in")) {
          // This is a fallback option - we should have gotten real options
          // But for now, at least ensure we have 2 of something
          const first = block.options[0];
          if (!first.name.includes(" — ")) {
            block.options.push({
              ...first,
              name: `${first.name} (Alternative)`,
            });
          }
        }
      });
    });
    
    // Light cross-day deduplication: prevent same place at same section across days
    // (e.g., "The Gage" for dinner on both Day 1 and Day 2 → remove from Day 2)
    // But allow same place at different sections (e.g., Day 1 lunch vs Day 2 dinner)
    const SECTION_PLACE_SEEN = new Map(); // "section-name" -> first day index
    
    trip.days.forEach((day, dayIndex) => {
      if (!Array.isArray(day.blocks)) return;
      
      day.blocks.forEach((block) => {
        if (!Array.isArray(block.options)) return;
        
        const blockSection = (block.section || "").toLowerCase();
        const keptOptions = [];
        const blockSeen = new Set(); // Track within this block
        
        block.options.forEach((opt) => {
          if (!opt || !opt.name) return;
          const placeName = opt.name.trim().toLowerCase();
          
          // Skip duplicates within the same block
          if (blockSeen.has(placeName)) {
            return;
          }
          blockSeen.add(placeName);
          
          const sectionKey = `${blockSection}-${placeName}`;
          
          // If we've seen this place at this same section/time on a different day, skip it
          // BUT: keep it if this block would have less than 2 options after removal
          if (SECTION_PLACE_SEEN.has(sectionKey)) {
            const firstDayIndex = SECTION_PLACE_SEEN.get(sectionKey);
            if (firstDayIndex !== dayIndex) {
              // Count how many options we would have if we skip this one
              const wouldHaveCount = keptOptions.length;
              // Only skip if we already have 2+ options, otherwise keep duplicates
              if (wouldHaveCount >= 2) {
                return; // Skip - duplicate at same time across days
              }
              // Otherwise keep it to ensure minimum 2 options
            }
          }
          
          // Mark it and keep it (only mark on first appearance)
          if (!SECTION_PLACE_SEEN.has(sectionKey)) {
            SECTION_PLACE_SEEN.set(sectionKey, dayIndex);
          }
          keptOptions.push(opt);
        });
        
        // Ensure we keep at least 2 options even if they're duplicates
        if (keptOptions.length === 0 && block.options.length > 0) {
          // Keep first 2 options even if duplicates
          keptOptions.push(...block.options.slice(0, 2));
        }
        
        block.options = keptOptions;
      });
    });
    
    // Final safety check: ensure no block is empty AND mark blocks with only 1 option
    trip.days.forEach((day, dayIndex) => {
      if (!Array.isArray(day.blocks)) return;
      day.blocks.forEach((block) => {
        if (!Array.isArray(block.options) || block.options.length === 0) {
          console.error(`❌ CRITICAL: Block ${block.section} is empty after all processing!`);
          const destination = trip.to || trip.destination || "city";
          const hotel = day.hotel || {};
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
        } else if (block.options.length === 1) {
          // Mark for later filling - this will be handled in tripController
          console.warn(`⚠️ Block ${block.section} in day ${dayIndex + 1} has only 1 option after deduplication`);
        }
      });
    });

    return trip;
  } catch (e) {
    console.warn("enforceUniquePlaces failed, returning original trip:", e);
    return trip;
  }
}
