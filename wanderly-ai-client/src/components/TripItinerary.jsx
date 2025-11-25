// src/components/TripItinerary.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../lib/config.js';
import TripRouteMap from './TripRouteMap.jsx';

// ==========================
// COST HELPERS
// ==========================
function computeDayCost(day, selectedOptions) {
  let total = 0;
  const items = day?.items || [];
  for (let blockIdx = 0; blockIdx < items.length; blockIdx++) {
    const block = items[blockIdx];
    const selIdx = selectedOptions?.[`${day.day}-${blockIdx}`] ?? 0;
    const opt = block?.options?.[selIdx];
    if (opt?.cost_estimate?.amount != null) {
      total += Number(opt.cost_estimate.amount) || 0;
    }
  }
  return total;
}

function computeTripCost(plan, selectedOptions) {
  let total = 0;
  for (const day of plan?.daily || []) {
    total += computeDayCost(day, selectedOptions);
  }
  return total;
}

// ==========================
// BUDGET METER UI
// ==========================
function BudgetMeter({ tripTotal, budget, currency }) {
  if (!budget) return null;

  const pct = Math.min(100, Math.round(((tripTotal || 0) / (budget || 1)) * 100));
  const remaining = (budget || 0) - (tripTotal || 0);

  let color = 'bg-green-500';
  if (pct > 85) color = 'bg-yellow-500';
  if (pct > 100) color = 'bg-red-500';

  return (
    <div className="border rounded p-3 bg-gray-50 mb-4">
      <div className="text-sm font-medium mb-1">
        Budget usage: {pct}% ({tripTotal} / {budget} {currency})
      </div>
      <div className="w-full h-3 bg-gray-200 rounded">
        <div className={`h-3 rounded ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="text-xs text-gray-600 mt-1">
        {remaining >= 0
          ? `Remaining: ${remaining} ${currency}`
          : `Over by: ${Math.abs(remaining)} ${currency}`}
      </div>
    </div>
  );
}

function approxHotelFromLevel(level, currency = '') {
  const map = {
    low: '$40–$90',
    moderate: '$90–$180',
    high: '$180–$350+',
  };
  const base = map[String(level || '').toLowerCase()] || '';
  if (!base) return '';
  if (!currency || currency === 'USD') return base;
  return `${base.replace(/\$/g, '')} ${currency}`;
}

export default function TripItinerary({ plan }) {
  if (!plan) return null;

  const hasDaily = Array.isArray(plan.daily) && plan.daily.length > 0;
  const hasHotels = Array.isArray(plan.hotels) && plan.hotels.length > 0;
  const hasTips = Array.isArray(plan.tips) && plan.tips.length > 0;

  // resolved[key] = { data, loading, error }
  const [resolved, setResolved] = useState({});
  // selectedOptions[day-block] = optionIndex
  const [selectedOptions, setSelectedOptions] = useState({});

  // Reset state when a new plan arrives
  useEffect(() => {
    setResolved({});
    setSelectedOptions({});
  }, [plan]);

  // Auto-resolve FIRST option for each block so map has data immediately
  useEffect(() => {
    if (!hasDaily) return;

    const totalBlocks = Array.isArray(plan.daily)
      ? plan.daily.reduce((sum, d) => sum + ((d.items || []).length), 0)
      : 0;
    const maxToResolve = Math.min(totalBlocks || 0, 50);
    let cancelled = false;

    const run = async () => {
      let count = 0;

      for (const day of plan.daily) {
        const blocks = day.items || [];

        for (let bi = 0; bi < blocks.length; bi++) {
          const opt = blocks[bi]?.options?.[0];
          if (!opt?.name) continue;

          const key = `${day.day}-${bi}-0`;
          if (resolved[key]?.data || resolved[key]?.loading) continue;

          // default selection = first option
          setSelectedOptions((prev) =>
            prev[`${day.day}-${bi}`] == null
              ? { ...prev, [`${day.day}-${bi}`]: 0 }
              : prev
          );

          setResolved((prev) => ({
            ...prev,
            [key]: { ...(prev[key] || {}), loading: true },
          }));

          try {
            const res = await axios.get(`${API_BASE}/api/resolve-place`, {
              params: {
                query: opt.name,
                location: plan?.destination || '',
                lang: plan?.meta?.language || 'en',
                type: (opt?.type || '').toString().toLowerCase(),
              },
            });

            if (cancelled) return;

            setResolved((prev) => ({
              ...prev,
              [key]: { data: res.data, loading: false },
            }));
          } catch {
            if (cancelled) return;
            setResolved((prev) => ({
              ...prev,
              [key]: { error: 'Failed to resolve', loading: false },
            }));
          }

          count++;
          if (maxToResolve && count >= maxToResolve) break;
          await new Promise((r) => setTimeout(r, 150)); // avoid hammering Google
        }

        if (maxToResolve && count >= maxToResolve) break;
      }
    };

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, hasDaily]);

  const handleResolveOption = async (dayNum, blockIdx, optIdx, opt) => {
    const key = `${dayNum}-${blockIdx}-${optIdx}`;
    if (resolved[key]?.loading) return;

    // Mark this option as selected for that block
    setSelectedOptions((prev) => ({
      ...prev,
      [`${dayNum}-${blockIdx}`]: optIdx,
    }));

    // If already resolved, just update selection & let map use it
    if (resolved[key]?.data) return;

    setResolved((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), loading: true },
    }));

    try {
      const loc = plan?.destination || '';
      const res = await axios.get(`${API_BASE}/api/resolve-place`, {
        params: {
          query: opt?.name || '',
          location: loc,
          lang: plan?.meta?.language || 'en',
          type: (opt?.type || '').toString().toLowerCase(),
        },
      });

      setResolved((prev) => ({
        ...prev,
        [key]: { data: res.data, loading: false },
      }));
    } catch {
      setResolved((prev) => ({
        ...prev,
        [key]: { error: 'Failed to resolve', loading: false },
      }));
    }
  };

  // Build stops for ONE day based on selected options
  const getStopsForDay = (day) => {
    const stops = [];
    const blocks = day.items || [];

    for (let bi = 0; bi < blocks.length; bi++) {
      const selIdx =
        selectedOptions[`${day.day}-${bi}`] != null
          ? selectedOptions[`${day.day}-${bi}`]
          : 0;

      const opt = blocks[bi]?.options?.[selIdx];
      if (!opt) continue;

      const key = `${day.day}-${bi}-${selIdx}`;
      const r = resolved[key];
      const lat = r?.data?.coordinates?.latitude;
      const lng = r?.data?.coordinates?.longitude;

      if (!lat || !lng) continue;

      stops.push({
        lat,
        lng,
        label: r?.data?.name || opt.name || blocks[bi]?.label || '',
        address: r?.data?.address || opt.address || '',
        photoRef: r?.data?.photoRef || null,
      });
    }

    return stops;
  };

  return (
    <div className="mt-6 bg-white border rounded-lg shadow-sm p-4 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{plan.destination}</h2>
        {plan.summary && <p className="text-gray-700 mt-1">{plan.summary}</p>}
      </div>

      {/* BUDGET METER */}
      <BudgetMeter
        tripTotal={computeTripCost(plan, selectedOptions)}
        budget={plan.budget?.amount}
        currency={plan.budget?.currency || plan.meta?.currency}
      />

      {hasDaily && (
        <div className="space-y-4">
          {plan.daily.map((day) => {
            const dayStops = getStopsForDay(day);

            return (
              <div key={day.day} className="border rounded-lg p-3 space-y-3">
                <div className="font-semibold mb-1">
                  Day {day.day}
                  {day.title
                    ? ` — ${day.title}`
                    : day.date_hint
                    ? ` — ${day.date_hint}`
                    : ''}
                </div>

                {/* DAILY COST SUMMARY */}
                <div className="text-sm font-medium text-gray-700 mb-1">
                  Day total: {computeDayCost(day, selectedOptions)}{' '}
                  {plan.meta?.currency || 'USD'}
                </div>

                <div className="md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-4">
                  {/* Sticky map on desktop */}
                  {dayStops.length >= 1 && (
                    <div className="mb-3 md:mb-0 md:sticky md:top-20 h-[260px]">
                      <TripRouteMap
                        stops={dayStops}
                        doRouting={day.day === plan.daily?.[0]?.day}
                      />
                    </div>
                  )}

                  {/* Blocks & options */}
                  <ul className="space-y-2">
                    {(day.items || []).map((block, blockIdx) => {
                      const time = block?.time;
                      const label = block?.label || block?.block_type || '';
                      const selIdx =
                        selectedOptions[`${day.day}-${blockIdx}`] != null
                          ? selectedOptions[`${day.day}-${blockIdx}`]
                          : 0;

                      return (
                        <li
                          key={blockIdx}
                          className="text-sm border rounded p-2 bg-white"
                        >
                          <div className="mb-1">
                            <span className="font-medium">{time}</span>{' '}
                            {label && (
                              <span className="font-semibold">
                                {' '}
                                — {label}
                              </span>
                            )}
                          </div>

                          <div className="grid md:grid-cols-2 gap-2">
                            {(block.options || []).map((opt, optIdx) => {
                              const displayName =
                                opt.name ||
                                opt.title ||
                                `Option ${optIdx + 1}`;
                              const cost =
                                opt.cost_estimate?.amount != null
                                  ? `${opt.cost_estimate.amount} ${
                                      opt.cost_estimate.currency ||
                                      plan?.meta?.currency ||
                                      ''
                                    }`
                                  : null;

                              const key = `${day.day}-${blockIdx}-${optIdx}`;
                              const r = resolved[key];
                              const isSelected = selIdx === optIdx;

                              return (
                                <div
                                  key={optIdx}
                                  className={
                                    'border rounded p-2 bg-gray-50 transition-colors ' +
                                    (isSelected
                                      ? 'bg-blue-50 border-blue-400'
                                      : '')
                                  }
                                >
                                  <div className="font-semibold">
                                    {displayName}
                                  </div>
                                  {opt.type && (
                                    <div className="text-xs uppercase text-gray-500">
                                      {opt.type}
                                    </div>
                                  )}
                                  {opt.description && (
                                    <div className="text-xs text-gray-700 mt-1">
                                      {opt.description}
                                    </div>
                                  )}

                                  {opt.famousFor && (
                                    <div className="text-xs text-gray-700 mt-1">
                                      ⭐ <span className="font-medium">Famous for:</span> {opt.famousFor}
                                    </div>
                                  )}

                                  {opt.whatToDo && (
                                    <div className="text-xs text-gray-700 mt-1">
                                      ✔️ <span className="font-medium">What to do:</span> {opt.whatToDo}
                                    </div>
                                  )}

                                  {opt.mustTryDish && (
                                    <div className="text-xs text-gray-700 mt-1">
                                      🍽 <span className="font-medium">Must-try:</span> {opt.mustTryDish}
                                    </div>
                                  )}

                                  {opt.recommendedDrink && (
                                    <div className="text-xs text-gray-700 mt-1">
                                      🥤 <span className="font-medium">Drink:</span> {opt.recommendedDrink}
                                    </div>
                                  )}

                                  {(r?.data?.address || opt.address) && (
                                    <div className="text-xs text-gray-600 mt-1">
                                      {opt.address || r?.data?.address}
                                    </div>
                                  )}

                                  {opt.tip && (
                                    <div className="text-xs text-yellow-700 mt-1">
                                      💡 <span className="font-medium">Tip:</span> {opt.tip}
                                    </div>
                                  )}

                                  {/* Duration, transport & distance */}
                                  <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                    {(opt.duration_min || opt.transport) && (
                                      <div>
                                        {opt.duration_min ? (
                                          <>⏱ {opt.duration_min} min</>
                                        ) : null}
                                        {opt.transport && (
                                          <>
                                            {opt.duration_min ? ' · ' : ''}
                                            {opt.transport}
                                          </>
                                        )}
                                      </div>
                                    )}
                                    {opt.distance_from_previous && (
                                      <div>
                                        📍 From previous:{' '}
                                        {opt.distance_from_previous}
                                      </div>
                                    )}
                                  </div>

                                  {cost && (
                                    <div className="text-xs text-gray-700 mt-1">
                                      Avg cost: {cost}
                                    </div>
                                  )}

                                  <button
                                    className={
                                      'mt-2 inline-block text-xs px-2 py-1 rounded border ' +
                                      (isSelected
                                        ? 'bg-blue-500 text-white border-blue-500'
                                        : 'bg-white text-blue-600 border-blue-500')
                                    }
                                    onClick={() =>
                                      handleResolveOption(
                                        day.day,
                                        blockIdx,
                                        optIdx,
                                        opt
                                      )
                                    }
                                    disabled={r?.loading}
                                  >
                                    {isSelected
                                      ? r?.loading
                                        ? 'Updating...'
                                        : 'Selected'
                                      : r?.loading
                                      ? 'Resolving...'
                                      : 'Choose this option'}
                                  </button>

                                  {r?.error && (
                                    <div className="text-xs text-red-600 mt-1">
                                      {r.error}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasHotels && (
        <div>
          <div className="font-semibold mb-1">Hotels</div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {plan.hotels.map((h, i) => (
              <li key={i}>
                <span className="font-medium">{h.name}</span>

                {/* PRICE */}
                {h.nightly_price?.amount != null ? (
                  <span className="text-gray-600">
                    {' '}· Avg nightly: {h.nightly_price.amount}{' '}
                    {h.nightly_price.currency || plan?.meta?.currency}
                  </span>
                ) : null}

                {/* RATING */}
                {h.rating && (
                  <span className="text-gray-600"> · ⭐ {h.rating}/5</span>
                )}

                {/* CHECK-IN */}
                {h.check_in && (
                  <span className="text-gray-600"> · Check-in {h.check_in}</span>
                )}

                {/* AMENITIES */}
                {h.amenities?.length > 0 && (
                  <div className="text-gray-600 text-xs mt-1">
                    {h.amenities.join(' • ')}
                  </div>
                )}

                {/* REASON */}
                {h.reason && (
                  <div className="text-gray-700 text-sm">{h.reason}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasTips && (
        <div>
          <div className="font-semibold mb-1">Tips</div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {plan.tips.map((tip, i) => {
              const text =
                typeof tip === 'string'
                  ? tip
                  : (tip && (tip.tip || tip.text || tip.message)) || '';
              if (!text) return null;
              return <li key={i}>{text}</li>;
            })}
          </ul>
        </div>
      )}

      {plan?.meta?.language && (
        <div className="text-xs text-gray-500">
          Language: {plan.meta.language}
          {plan?.meta?.generated_at ? ` · ${plan.meta.generated_at}` : ''}
        </div>
      )}
    </div>
  );
}
