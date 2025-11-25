import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import TripItinerary from '../components/TripItinerary.jsx';
import { API_BASE } from '../lib/config.js';
import { useTranslation } from 'react-i18next';
import BudgetMeter, { BudgetWarning } from '../components/BudgetMeter.jsx';
import TimelineStop from '../components/TimelineStop.jsx';
import TripMap from '../components/TripMap.jsx';

export default function TripPlanner() {
  const { i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  // ==========================
  // V3 FORM STATE
  // ==========================
  const [formValues, setFormValues] = useState({
    from: '',
    to: '',
    startDate: '',
    endDate: '',
    travelType: 'comfort',
    budget: '',
    language: 'en',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ctrl, setCtrl] = useState(null);

  // Hotels step
  const [hotels, setHotels] = useState([]);
  const [hotelPerDay, setHotelPerDay] = useState([]);
  const [step, setStep] = useState('form'); // form → hotels → itinerary

  // Itinerary step (legacy plan viewer kept for later Step 4)
  const [plan, setPlan] = useState(null);
  const [rawText, setRawText] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [trip, setTrip] = useState(null);

  // Selected option per block (single-select per block)
  const [selectedOptions, setSelectedOptions] = useState({});

  // Initialize from HotelSelection page if data is passed
  useEffect(() => {
    if (location.state) {
      const { formValues: passedFormValues, hotels: passedHotels, hotelPerDay: passedHotelPerDay } = location.state;
      if (passedFormValues && passedHotels && passedHotelPerDay) {
        setFormValues(passedFormValues);
        setHotels(passedHotels);
        setHotelPerDay(passedHotelPerDay);
        setStep('itinerary'); // Skip form and hotel selection, go straight to generating itinerary
        // Auto-generate trip
        generateTripFromState(passedFormValues, passedHotels, passedHotelPerDay);
      }
    }
  }, []);

  // Keep form language synced to i18n
  useEffect(() => {
    const lang = i18n.language === 'vi' ? 'vi' : 'en';
    setFormValues((f) => (f.language === lang ? f : { ...f, language: lang }));
  }, [i18n.language]);

  // Function to generate trip from passed state
  async function generateTripFromState(formVals, hotelsData, hotelPerDayData) {
    setLoading(true);
    setError('');
    setTrip(null);
    try {
      const res = await fetch(`${API_BASE}/api/trip/plan-v3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formVals,
          hotelPerDay: hotelPerDayData,
        }),
      });
      const data = await res.json();
      try { console.log('RAW V3 RESPONSE:', data); } catch {}
      if (!res.ok) throw new Error(data?.error || 'Failed to generate trip.');

      const normalize = (raw) => {
        const v = raw?.plan || raw?.trip || raw || {};
        if (Array.isArray(v.days)) {
          // Ensure hotels are attached to days from hotelPerDayData
          v.days = v.days.map((day, i) => {
            // Attach hotel from hotelPerDayData if not already present
            if (!day.hotel && hotelPerDayData && hotelPerDayData[i]) {
              day.hotel = hotelPerDayData[i];
            }
            if ((!Array.isArray(day.blocks) || day.blocks.length === 0) && Array.isArray(day.stops)) {
              day.blocks = day.stops.map((s) => ({
                time: s.time || '',
                section: (s.category || s.type || 'visit').toString().toLowerCase(),
                options: [
                  {
                    name: s.name || '',
                    lat: s.lat,
                    lng: s.lng,
                    category: s.category || '',
                    description: s.description || '',
                    estimatedCost: s.estimatedCost ?? s?.cost_estimate?.amount ?? 0,
                    transport: s.transport || '',
                    address: s.address,
                    rating: s.rating,
                    label: s.label,
                    tags: s.tags,
                  },
                ],
              }));
            }
            return day;
          });
          // Ensure hotels array exists
          if (!v.hotels && hotelsData) {
            v.hotels = hotelsData;
          }
          return v;
        }
        if (Array.isArray(v.daily)) {
          const days = v.daily.map((d, i) => ({
            day: d.day || i + 1,
            date: d.date || d.date_hint || '',
            hotel: hotelPerDayData[i] || null,
            blocks: (d.items || []).map((it) => ({
              time: it.time || '',
              section: (it.section || it.block_type || it.label || '').toString().toLowerCase(),
              options: it.options || [],
            })),
          }));
          return {
            flight: v.flight || null,
            travelStyle: v.travelStyle || null,
            hotels: hotelsData || [],
            days,
            costSummary: v.costSummary || null,
          };
        }
        return v;
      };

      const normalized = normalize(data);
      try { console.log('NORMALIZED DAYS COUNT:', normalized?.days?.length); } catch {}
      
      const computeTotals = (t) => {
        const next = JSON.parse(JSON.stringify(t || {}));
        const daysArr = Array.isArray(next.days) ? next.days : [];

        if (next.flight) {
          const f = next.flight;
          const avg = f.averageCost || f.cost || 0;
          next.flight = {
            ...f,
            averageCost: typeof avg === 'number' ? avg : 0,
            duration: f.duration || '',
            airports: f.airports || {},
          };
        }

        // Cost parser with robust fallbacks
        const parseCost = (v) => {
          if (v == null) return 0;
          if (typeof v === 'number') return v;
          if (typeof v === 'string') {
            const m = v.match(/(\d+(?:\.\d+)?)/);
            return m ? Number(m[1]) : 0;
          }
          if (typeof v === 'object') {
            if (v.amount != null) return Number(v.amount) || 0;
          }
          return 0;
        };

        const cheapestFromOptions = (opts) => {
          const costs = (opts || [])
            .map((o) =>
              parseCost(
                o.estimatedCost ?? o.cost ?? o.price ?? o.cost_estimate?.amount ?? o.avgCost
              )
            )
            .filter((n) => Number.isFinite(n));
          return costs.length ? Math.min(...costs) : 0;
        };

        // Calculate hotel cost from hotelPerDayData
        let hotelSum = 0;
        (hotelPerDayData || []).forEach((d) => {
          let price = 0;
          if (d && d.nightlyPrice != null) {
            price = typeof d.nightlyPrice === 'object' 
              ? Number(d.nightlyPrice.amount ?? 0) 
              : Number(d.nightlyPrice);
          }
          if (!Number.isNaN(price)) hotelSum += price;
        });

        let flightCost = 0;
        let transportCost = 0;
        let foodCost = 0;
        let activityCost = 0;

        if (next.flight && typeof next.flight.averageCost === 'number') {
          flightCost = next.flight.averageCost;
        }

        // Calculate food and activity costs from blocks
        daysArr.forEach((day) => {
          if (Array.isArray(day.blocks)) {
            day.blocks.forEach((block) => {
              const section = (block.section || '').toLowerCase();
              const cheapest = cheapestFromOptions(block.options || []);
              
              if (section === 'lunch' || section === 'dinner') {
                foodCost += cheapest;
              } else if (section !== 'lunch' && section !== 'dinner') {
                // All other blocks are activities
                activityCost += cheapest;
              }
            });
          }
        });

        const totalEstimated = flightCost + hotelSum + transportCost + foodCost + activityCost;
        const budgetNum = parseFloat(formVals.budget || '0') || 0;
        const pct = budgetNum > 0 ? (totalEstimated / budgetNum) * 100 : 0;
        const status = pct > 100 ? 'way_over' : pct > 85 ? 'over' : pct <= 85 ? 'on_track' : 'under';

        // Use same field names as BudgetMeter expects
        next.costSummary = {
          totalFlightCost: flightCost,
          totalHotelCost: hotelSum,
          totalTransportCost: transportCost,
          totalFoodCost: foodCost,
          totalActivitiesCost: activityCost,
          totalEstimatedCost: totalEstimated,
          budget: budgetNum,
          budgetUsedPercent: pct,
          budgetStatus: status,
        };
        next.days = daysArr;
        return next;
      };

      setTrip(computeTotals(normalized));
    } catch (err) {
      setError(err.message || 'Failed to generate trip.');
    } finally {
      setLoading(false);
    }
  }

  // Helper utils
  function getDaysBetween(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    const diff = e - s;
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
  function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  // Submit -> fetch hotels (Step 2)
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setPlan(null);
    setRawText('');
    setWarnings([]);

    // basic required checks
    if (!formValues.from || !formValues.to || !formValues.startDate || !formValues.endDate) {
      setError("Please fill From, To, Start Date and End Date.");
      return;
    }

    try { ctrl?.abort?.(); } catch {}
    const controller = new AbortController();
    setCtrl(controller);

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/trip/hotels-v3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: formValues.to,
          startDate: formValues.startDate,
          endDate: formValues.endDate,
          travelType: formValues.travelType,
          budget: formValues.budget,
          language: formValues.language,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch hotels');

      const hotelList = data?.hotels || [];
      setHotels(hotelList);

      const numDays = getDaysBetween(formValues.startDate, formValues.endDate);
      const defaultHotel = hotelList[0] || {};
      const normalizeNightly = (h) => {
        if (!h) return 0;
        if (typeof h.nightlyPrice === 'number') return h.nightlyPrice;
        if (typeof h.nightlyPrice === 'object' && h.nightlyPrice.amount != null) {
          return Number(h.nightlyPrice.amount) || 0;
        }
        return 0;
      };

      const perDay = Array.from({ length: numDays }, (_, i) => ({
        day: i + 1,
        date: addDays(formValues.startDate, i),
        hotelId: defaultHotel?.id || '',
        name: defaultHotel?.name || '',
        lat: defaultHotel?.lat || 0,
        lng: defaultHotel?.lng || 0,
        address: defaultHotel?.address || '',
        nightlyPrice: normalizeNightly(defaultHotel),
        currency: defaultHotel?.currency || 'USD',
      }));
      setHotelPerDay(perDay);
      setStep('hotels');
    } catch (e) {
      setError(e.message || 'Failed to fetch hotels');
    } finally {
      setLoading(false);
    }
  }

  function handleDayHotelChange(i, hotelId) {
    const hotel = hotels.find((h) => h.id === hotelId) || {};
    const normalizeNightly = (h) => {
      if (!h) return 0;
      if (typeof h.nightlyPrice === 'number') return h.nightlyPrice;
      if (typeof h.nightlyPrice === 'object' && h.nightlyPrice.amount != null) {
        return Number(h.nightlyPrice.amount) || 0;
      }
      return 0;
    };

    setHotelPerDay((prev) => {
      const copy = [...prev];
      copy[i] = {
        ...copy[i],
        hotelId,
        name: hotel.name || '',
        address: hotel.address || '',
        lat: hotel.lat || 0,
        lng: hotel.lng || 0,
        nightlyPrice: normalizeNightly(hotel),
        currency: hotel.currency || 'USD',
      };
      return copy;
    });
  }

  function goToTripStep() {
    // Trigger generation immediately
    generateTrip();
  }

  async function generateTrip() {
    setLoading(true);
    setError('');
    setTrip(null);
    try {
      const res = await fetch(`${API_BASE}/api/trip/plan-v3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formValues,
          hotelPerDay,
        }),
      });
      const data = await res.json();
      // DEBUG: show raw V3 response before normalization
      try { console.log('RAW V3 RESPONSE:', data); } catch {}
      if (!res.ok) throw new Error(data?.error || 'Failed to generate trip.');

      const normalize = (raw) => {
        const v = raw?.plan || raw?.trip || raw || {};
        if (Array.isArray(v.days)) {
          // Force V3 shape: if no blocks, convert stops → blocks with single option
          v.days = v.days.map((day) => {
            if ((!Array.isArray(day.blocks) || day.blocks.length === 0) && Array.isArray(day.stops)) {
              day.blocks = day.stops.map((s) => ({
                time: s.time || '',
                section: (s.category || s.type || 'visit').toString().toLowerCase(),
                options: [
                  {
                    name: s.name || '',
                    lat: s.lat,
                    lng: s.lng,
                    category: s.category || '',
                    description: s.description || '',
                    estimatedCost: s.estimatedCost ?? s?.cost_estimate?.amount ?? 0,
                    transport: s.transport || '',
                    address: s.address,
                    rating: s.rating,
                    label: s.label,
                    tags: s.tags,
                  },
                ],
              }));
            }
            // Ensure every block has at least one option
            // Backend should always provide options, so no frontend fallback needed
            // If blocks have no options, it means backend processing failed
            return day;
          });
          return v;
        }
        // legacy shape -> build days/blocks from daily/items/options
        if (Array.isArray(v.daily)) {
          const days = v.daily.map((d, i) => ({
            day: d.day || i + 1,
            date: d.date || d.date_hint || '',
            hotel: hotelPerDay[i] || v.hotels?.[0] || null,
            blocks: (d.items || []).map((it) => ({
              time: it.time || '',
              section: (it.section || it.block_type || it.label || '').toString().toLowerCase(),
              options: it.options || [],
            })),
          }));
          return {
            flight: v.flight || null,
            travelStyle: v.travelStyle || null,
            hotels: v.hotels || [],
            days,
            costSummary: v.costSummary || null,
          };
        }
        return v; // best effort
      };

      const normalized = normalize(data);
      // Debug: ensure all days from backend are visible before rendering
      try { console.log('NORMALIZED DAYS COUNT:', normalized?.days?.length); } catch {}
      const computeTotals = (t) => {
        const next = JSON.parse(JSON.stringify(t || {}));
        const daysArr = Array.isArray(next.days) ? next.days : [];

        // Normalize flight object to expected shape for rendering and totals
        if (next.flight) {
          const f = next.flight;
          const avg =
            f.averageCost ??
            f.priceUSD ??
            f.price ??
            (f.cost_estimate && f.cost_estimate.amount) ??
            0;
          const duration =
            f.duration ||
            (f.durationHours != null ? `${f.durationHours}h` : "") ||
            f.totalDuration ||
            "";
          const airports =
            f.airports ||
            (f.departureAirport || f.arrivalAirport
              ? {
                  departure: f.departureAirport || "",
                  arrival: f.arrivalAirport || "",
                }
              : null);
          next.flight = {
            averageCost: Number(avg) || 0,
            currency: f.currency || "USD",
            duration,
            airports,
            notes: f.notes || "",
          };
        }

        // Hotel cost: sum nightlyPrice for selected hotel per day
        const idToHotel = new Map(
          (next.hotels || []).map((h) => [h.id || h.name, h])
        );

        let hotelSum = 0;
        (hotelPerDay || []).forEach((d) => {
          let price = 0;

          if (d && d.nightlyPrice != null) {
            // if nightlyPrice came from /hotels-v3
            price =
              typeof d.nightlyPrice === 'object'
                ? Number(d.nightlyPrice.amount ?? 0)
                : Number(d.nightlyPrice);
          } else {
            // fallback to whatever the trip object has
            const key = d.hotelId || d.name;
            const ref = idToHotel.get(key) || {};
            price =
              typeof ref.nightlyPrice === 'object'
                ? Number(ref.nightlyPrice.amount ?? 0)
                : Number(ref.nightlyPrice ?? 0);
          }

          if (!Number.isNaN(price)) hotelSum += price;
        });

        // Cost parser with robust fallbacks
        const parseCost = (v) => {
          if (v == null) return 0;
          if (typeof v === 'number') return v;
          if (typeof v === 'string') {
            const m = v.match(/(\d+(?:\.\d+)?)/);
            return m ? Number(m[1]) : 0;
          }
          if (typeof v === 'object') {
            if (v.amount != null) return Number(v.amount) || 0;
          }
          return 0;
        };

        const cheapestFromOptions = (opts) => {
          const costs = (opts || [])
            .map((o) =>
              parseCost(
                o.estimatedCost ?? o.cost ?? o.price ?? o.cost_estimate?.amount ?? o.avgCost
              )
            )
            .filter((n) => Number.isFinite(n));
          return costs.length ? Math.min(...costs) : 0;
        };

        // Per-day totals: if missing, approximate from blocks or stops
        daysArr.forEach((day, idx) => {
          if (day.totalDayCost == null) {
            let sum = 0;
            if (Array.isArray(day.blocks) && day.blocks.length) {
              day.blocks.forEach((b) => {
                const opts = b.options || [];
                if (opts.length) {
                  // use the cheapest option in this block as default selection cost
                  const cheapest = cheapestFromOptions(opts);
                  if (Number.isFinite(cheapest)) sum += cheapest;
                }
              });
            } else if (Array.isArray(day.stops) && day.stops.length) {
              day.stops.forEach((s) => {
                const c = parseCost(
                  s.estimatedCost ?? s.cost ?? s.price ?? s.cost_estimate?.amount ?? s.avgCost
                );
                if (!Number.isNaN(c)) sum += c;
              });
            }
            day.totalDayCost = Math.round(sum);
          }
        });

        // Build/patch costSummary
        const cs = next.costSummary || {};
        
        // Food cost: sum lunch and dinner blocks only
        const totalFood =
          cs.totalFoodCost ??
          daysArr.reduce((acc, d) => {
            const foodBlocks = (d.blocks || []).filter(
              (b) => {
                const section = (b.section || '').toString().toLowerCase();
                return section === 'lunch' || section === 'dinner';
              }
            );
            let sum = 0;
            foodBlocks.forEach((b) => {
              const cheapest = cheapestFromOptions(b.options || []);
              if (Number.isFinite(cheapest)) sum += cheapest;
            });
            return acc + sum;
          }, 0);
        
        // Activities cost: sum all non-food blocks (morning, midday, afternoon, evening, night, late_night)
        const totalActivities =
          cs.totalActivitiesCost ??
          daysArr.reduce((acc, d) => {
            const activityBlocks = (d.blocks || []).filter(
              (b) => {
                const section = (b.section || '').toString().toLowerCase();
                return section !== 'lunch' && section !== 'dinner';
              }
            );
            let sum = 0;
            activityBlocks.forEach((b) => {
              const cheapest = cheapestFromOptions(b.options || []);
              if (Number.isFinite(cheapest)) sum += cheapest;
            });
            return acc + sum;
          }, 0);
        
        // Transport cost: sum transport-specific costs (usually from transport field or activity transport costs)
        const totalTransport =
          cs.totalTransportCost ??
          daysArr.reduce((acc, d) => {
            let sum = 0;
            (d.blocks || []).forEach((b) => {
              (b.options || []).forEach((o) => {
                // Transport costs are usually minimal or included, but check if there's a specific transport cost field
                const transportCost = parseCost(
                  o.transportCost ?? o.transport_cost ?? 0
                );
                if (transportCost > 0) sum += transportCost;
              });
            });
            return acc + sum;
          }, 0);
        
        const totalFlight = cs.totalFlightCost ?? Number(next.flight?.averageCost || 0);
        const totalHotel = hotelSum || cs.totalHotelCost || 0;
        const totalEstimated = cs.totalEstimatedCost ?? (totalFlight + totalHotel + totalTransport + totalActivities + (Number(totalFood) || 0));
        const budgetNum = Number(next.costSummary?.budget || formValues.budget || 0) || 0;
        const pct = budgetNum ? Math.round((totalEstimated / budgetNum) * 100) : (cs.budgetUsedPercent || 0);
        const status = cs.budgetStatus || (budgetNum ? (pct <= 85 ? 'on_track' : pct <= 100 ? 'over' : 'way_over') : 'on_track');

        next.costSummary = {
          totalFlightCost: totalFlight,
          totalHotelCost: totalHotel,
          totalTransportCost: totalTransport,
          totalFoodCost: totalFood || 0,
          totalActivitiesCost: totalActivities,
          totalEstimatedCost: totalEstimated,
          budget: budgetNum,
          budgetUsedPercent: pct,
          budgetStatus: status,
        };
        next.days = daysArr;
        return next;
      };

      setTrip(computeTotals(normalized));
      setStep('itinerary');
    } catch (err) {
      setError(err.message || 'Failed to generate trip.');
    } finally {
      setLoading(false);
    }
  }

  // Legacy validator kept to display potential warnings once we render an itinerary in Step 4
  const validatePlan = (p) => {
    const w = [];
    if (!p) return w;
    const expectedDays = Number(p.days || 0);
    if (Array.isArray(p.daily) && expectedDays && p.daily.length !== expectedDays) {
      w.push(`Daily sections (${p.daily.length}) differ from days (${expectedDays}).`);
    }
    if (Array.isArray(p.daily)) {
      p.daily.forEach((d, i) => {
        if (typeof d.day !== 'number' || d.day !== i + 1) {
          w.push(`Day numbering issue at index ${i} (got ${d.day}).`);
        }
      });
    }
    return w;
  };

  // Local sanitizer mirrors backend to recover JSON-like responses (used later in Step 4)
  const sanitizePotentialJson = (input) => {
    if (!input || typeof input !== 'string') return '';
    let text = input.trim();
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    text = text.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\u2060\u00A0]/g, ' ');
    text = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
    text = text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return '';
    let jsonBlock = text.slice(first, last + 1);
    jsonBlock = jsonBlock.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    return jsonBlock;
  };
  // normalizeBlocks was disabled to avoid masking backend issues. We render blocks as returned by backend.

  // Handle selecting one option per block
  function handleSelectOption(dayIndex, block, option) {
    const key = `day-${dayIndex}-${(block.section || '').toString().toLowerCase()}`;
    setSelectedOptions((prev) => ({ ...prev, [key]: option }));
  }

  // Compute per-day total from selected options
  function computeSelectedDayCost(dayIndex, blocks = []) {
    const parseCost = (v) => {
      if (v == null) return 0;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const m = v.match(/(\d+(?:\.\d+)?)/);
        return m ? Number(m[1]) : 0;
      }
      if (typeof v === 'object') {
        if (v.amount != null) return Number(v.amount) || 0;
        if (v.cost_estimate?.amount != null) return Number(v.cost_estimate.amount) || 0;
      }
      return 0;
    };

    let total = 0;
    blocks.forEach((b) => {
      const key = `day-${dayIndex}-${(b.section || '').toString().toLowerCase()}`;
      const chosen = selectedOptions[key];
      if (chosen) {
        total += parseCost(
          chosen.estimatedCost ?? chosen.cost ?? chosen.price ?? chosen.cost_estimate?.amount
        );
      } else if (Array.isArray(b.options) && b.options.length) {
        let cheapest = Infinity;
        b.options.forEach((opt) => {
          const val = parseCost(
            opt.estimatedCost ?? opt.cost ?? opt.price ?? opt.cost_estimate?.amount
          );
          if (val && val < cheapest) cheapest = val;
        });
        if (cheapest !== Infinity) total += cheapest;
      }
    });
    return total;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF7F2' }}>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4" style={{ color: '#1E1E1E' }}>Trip Planner</h1>

      {/* STEP: FORM */}
      {step === 'form' && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="From (city or airport)"
            value={formValues.from}
            onChange={(e) => setFormValues({ ...formValues, from: e.target.value })}
            required
            className="border p-2 w-full"
            disabled={loading}
          />
          <input
            type="text"
            placeholder="To (destination city)"
            value={formValues.to}
            onChange={(e) => setFormValues({ ...formValues, to: e.target.value })}
            required
            className="border p-2 w-full"
            disabled={loading}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium" style={{ color: '#1E1E1E' }}>Start Date</label>
              <input
                type="date"
                value={formValues.startDate}
                onChange={(e) => setFormValues({ ...formValues, startDate: e.target.value })}
                required
                className="border p-2 w-full"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium" style={{ color: '#1E1E1E' }}>End Date</label>
              <input
                type="date"
                value={formValues.endDate}
                onChange={(e) => setFormValues({ ...formValues, endDate: e.target.value })}
                required
                className="border p-2 w-full"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium" style={{ color: '#1E1E1E' }}>Travel Type</label>
              <select
                value={formValues.travelType}
                onChange={(e) => setFormValues({ ...formValues, travelType: e.target.value })}
                className="border p-2 w-full"
                disabled={loading}
              >
                <option value="economy">Economy</option>
                <option value="comfort">Comfort</option>
                <option value="premium">Premium</option>
                <option value="luxury">Luxury</option>
              </select>
            </div>
          </div>

          <input
            type="number"
            placeholder="Budget (USD)"
            value={formValues.budget}
            onChange={(e) => setFormValues({ ...formValues, budget: e.target.value })}
            className="border p-2 w-full"
            disabled={loading}
          />

          <button 
            type="submit" 
            disabled={loading} 
            className="text-white px-4 py-2 rounded transition-colors duration-200 font-semibold"
            style={{
              backgroundColor: loading ? '#D1D5DB' : '#EFBF3D',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = '#D9AD31';
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = '#EFBF3D';
            }}
          >
            {loading ? 'Loading hotels...' : 'Find Hotels'}
          </button>

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">{error}</div>
          )}
        </form>
      )}

      {/* STEP: HOTELS SELECTION */}
      {step === 'hotels' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold" style={{ color: '#1E1E1E' }}>Select Your Hotel For Each Day</h2>

          <div className="grid md:grid-cols-2 gap-3">
            {hotels.map((h, hi) => (
              <div key={h.id || `${h.name || 'hotel'}-${hi}`} className="border rounded p-3 bg-white">
                <div className="font-semibold">{h.name}</div>
                <div className="text-sm text-slate-700">{h.area}</div>
                <div className="text-sm text-slate-600">{h.address}</div>
                <div className="text-sm text-slate-800 mt-1">⭐ {h.rating} · ${typeof h.nightlyPrice === 'number' ? h.nightlyPrice : (h.nightlyPrice?.amount ?? '')} / night</div>
                {h.url && (
                  <a href={h.url} target="_blank" rel="noreferrer" className="text-blue-600 text-sm mt-1 inline-block">
                    View site
                  </a>
                )}
              </div>
            ))}
          </div>

          <h3 className="text-lg font-semibold" style={{ color: '#1E1E1E' }}>Assign Hotel per Day</h3>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="p-2">Day</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Hotel</th>
                </tr>
              </thead>
              <tbody>
                {hotelPerDay.map((d, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">Day {d.day}</td>
                    <td className="p-2">{d.date}</td>
                    <td className="p-2">
                      <select
                        value={d.hotelId}
                        onChange={(e) => handleDayHotelChange(i, e.target.value)}
                        className="border p-2 w-full"
                        disabled={loading}
                      >
                        {hotels.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.area})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={generateTrip}
              disabled={loading}
              className="px-4 py-2 rounded text-white inline-flex items-center gap-2 font-semibold transition-colors duration-200"
              style={{
                backgroundColor: loading ? '#D1D5DB' : '#EFBF3D',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#D9AD31';
              }}
              onMouseLeave={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#EFBF3D';
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  Generating Trip...
                </>
              ) : (
                'Generate Trip Itinerary'
              )}
            </button>
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP: ITINERARY - Loading State */}
      {step === 'itinerary' && loading && !trip && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 mb-4" style={{ borderColor: '#EFBF3D' }}></div>
          <p className="text-xl font-semibold" style={{ color: '#1E1E1E' }}>Generating your trip itinerary...</p>
          <p className="text-sm mt-2" style={{ color: '#1E1E1E', opacity: 0.7 }}>This may take a few moments</p>
        </div>
      )}

      {/* STEP: ITINERARY (placeholder until Step 4) */}
      {step === 'itinerary' && trip && (
        <div className="space-y-4">
          {/* Back Button */}
          <button
            onClick={() => {
              // If came from HotelSelection, go back to hotels page
              if (location.state) {
                navigate('/hotels');
              } else {
                // Otherwise reset to form step
                setStep('form');
                setTrip(null);
              }
            }}
            className="mb-4 px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          {trip.costSummary && (
            <>
              <BudgetWarning budgetStatus={trip.costSummary.budgetStatus} />
              <BudgetMeter costSummary={trip.costSummary} />
            </>
          )}
          <h2 className="text-xl font-semibold" style={{ color: '#1E1E1E' }}>✈️ Flight</h2>
          {trip.flight && (
            <div className="text-sm">
              <div>Cost: ${trip.flight.averageCost}</div>
              <div>Duration: {trip.flight.duration}</div>
              {trip.flight.airports && (
                <div>
                  From {trip.flight.airports.departure} → {trip.flight.airports.arrival}
                </div>
              )}
            </div>
          )}

          <h2 className="text-xl font-semibold" style={{ color: '#1E1E1E' }}>🏨 Your Hotels</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {(trip.hotels || []).map((h, hi) => (
              <div key={h.id || `${h.name || 'hotel'}-${hi}`} className="border rounded p-3 bg-white">
                <div className="font-semibold">{h.name}</div>
                <div className="text-sm text-slate-700">{h.address}</div>
                <div className="text-sm text-slate-700">{h.area}</div>
                <div className="text-sm">⭐ {h.rating}</div>
              </div>
            ))}
          </div>

          <h2 className="text-xl font-semibold" style={{ color: '#1E1E1E' }}>🗓 Daily Itinerary</h2>
          <div className="space-y-3">
            {trip?.days?.map((d, idx) => {
              const blocks = Array.isArray(d.blocks) ? d.blocks : [];
              try { console.log('DAY BLOCKS:', d.blocks); } catch {}
              return (
              <div key={`day-${idx}`} className="border rounded p-3">
                <h3 className="font-semibold">Day {d.day} — {d.date}</h3>
                {d.hotel && (
                  <div className="text-sm text-slate-700">Hotel: {d.hotel.name}</div>
                )}
                {d.hotel && (
                  <TripMap
                    day={d}
                    selectedOptions={selectedOptions}
                    dayIndex={idx}
                    onOptimizedRoute={(dayNum, optimizedStops) => {
                      setTrip((prev) => {
                        try {
                          const copy = JSON.parse(JSON.stringify(prev));
                          const ref = (copy?.days || []).find((x) => x.day === dayNum);
                          if (!ref) return prev;
                          // Overwrite blocks with new order (keeping same shape from backend)
                          ref.blocks = Array.isArray(optimizedStops) ? optimizedStops : ref.blocks;
                          return copy;
                        } catch {
                          return prev;
                        }
                      });
                    }}
                  />
                )}
                <div className="mt-2">
                  {Array.isArray(blocks) && blocks.length > 0 ? (
                    blocks.map((b, bi) => (
                      <div key={`${d.date}-${b.section}-${bi}-${b.time || ''}`} className="mb-6 p-4 bg-[#f8f9fc] rounded-xl border border-gray-200">
                          <div className="text-sm font-semibold text-slate-700 mb-2">
                            {(b.section || '').toString().toUpperCase()} {b.time ? `— ${b.time}` : ''}
                          </div>
                          <div className="space-y-2">
                          {Array.isArray(b.options) && b.options.length > 0 ? (
                            b.options.map((opt, oi) => {
                              const key = `day-${idx}-${(b.section || '').toString().toLowerCase()}`;
                              const isSelected =
                                selectedOptions[key] &&
                                selectedOptions[key].name === opt.name;
                              return (
                                <div
                                  key={`${d.date}-${b.section}-${oi}`}
                                  onClick={() => handleSelectOption(idx, b, opt)}
                                  className={`cursor-pointer p-2 rounded-lg border ${
                                    isSelected ? 'border-blue-500 bg-blue-50 shadow' : 'border-gray-300 bg-white'
                                  }`}
                                >
                                  <TimelineStop stop={opt} />
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-sm text-gray-600">No places found</div>
                          )}
                          </div>
                        </div>
                      ))
                   ) : (
                    (d.stops || []).map((s, i) => <TimelineStop key={`day-${idx}-stop-${i}`} stop={s} />)
                   )}
                 </div>
                <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                  <div>
                    <strong>Day Total:</strong> ${computeSelectedDayCost(idx, blocks)}
                  </div>
                </div>
               </div>
             );})}
           </div>
        </div>
      )}

      {/* Keep legacy viewer hidden until used again */}
      {step === 'itinerary' && !trip && plan && (
        <>
          {warnings.length > 0 && (
            <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-900 rounded p-3 text-sm">
              <div className="font-semibold mb-1">Validation warnings</div>
              <ul className="list-disc pl-5">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <TripItinerary plan={plan} />
        </>
      )}
      </div>
    </div>
  );
}


