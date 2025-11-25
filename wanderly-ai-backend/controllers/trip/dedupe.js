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
    
    // STRONG cross-day deduplication: prevent same restaurant across ALL restaurant sections (lunch/dinner)
    // Track restaurants seen across all days to prevent repeats in any meal time
    const RESTAURANT_SEEN = new Map(); // "restaurant-name" -> first day index and section
    const SECTION_PLACE_SEEN = new Map(); // "section-name" -> first day index
    
    trip.days.forEach((day, dayIndex) => {
      if (!Array.isArray(day.blocks)) return;
      
      day.blocks.forEach((block) => {
        if (!Array.isArray(block.options)) return;
        
        const blockSection = (block.section || "").toLowerCase();
        const isRestaurantBlock = blockSection === "lunch" || blockSection === "dinner";
        const keptOptions = [];
        const blockSeen = new Set(); // Track within this block
        
        block.options.forEach((opt) => {
          if (!opt || !opt.name) return;
          const placeName = opt.name.trim().toLowerCase();
          const isRestaurant = opt.type === "restaurant" || isRestaurantBlock;
          
          // Skip duplicates within the same block
          if (blockSeen.has(placeName)) {
            return;
          }
          blockSeen.add(placeName);
          
          // STRICT RULE: If this is a restaurant, never repeat it across ANY day
          // Even if it's lunch on day 2 and dinner on day 3, we should have different restaurants
          if (isRestaurant && RESTAURANT_SEEN.has(placeName)) {
            const seenInfo = RESTAURANT_SEEN.get(placeName);
            // Only skip if we have 2+ options already
            if (keptOptions.length >= 2) {
              return; // Skip this duplicate restaurant
            }
            // If we have less than 2, we'll keep it but log a warning
            console.warn(`⚠️ Restaurant "${opt.name}" repeated across days but kept for minimum options`);
          }
          
          // Track restaurant for cross-day deduplication
          if (isRestaurant && !RESTAURANT_SEEN.has(placeName)) {
            RESTAURANT_SEEN.set(placeName, { dayIndex, section: blockSection });
          }
          
          const sectionKey = `${blockSection}-${placeName}`;
          
          // If we've seen this place at this same section/time on a different day, skip it
          if (SECTION_PLACE_SEEN.has(sectionKey)) {
            const firstDayIndex = SECTION_PLACE_SEEN.get(sectionKey);
            if (firstDayIndex !== dayIndex) {
              // Only skip if we already have 2+ options
              if (keptOptions.length >= 2) {
                return; // Skip - duplicate at same time across days
              }
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
