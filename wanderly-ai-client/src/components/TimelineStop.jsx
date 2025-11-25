// src/components/TimelineStop.jsx
export default function TimelineStop({ stop }) {
  if (!stop) return null;

  const {
    name,
    label,
    type,
    description,
    address,
    tags,
    rating,
    distanceFromPrevious,
    transport,
    estimatedCost,
    famousFor,
    whatToDo,
    mustTryDish,
    recommendedDrink,
    tip,
  } = stop || {};

  const cost =
    typeof estimatedCost === "object"
      ? estimatedCost.amount
      : estimatedCost;

  function buildDistanceTransport() {
    const parts = [];

    const dist =
      typeof distanceFromPrevious === "string"
        ? distanceFromPrevious.trim()
        : "";

    const trans =
      typeof transport === "string" ? transport.trim() : "";

    if (dist) {
      // If the model already returned a sentence with "Distance:", just use it
      if (/distance:/i.test(dist)) {
        parts.push(dist);
      } else {
        parts.push(`Distance: ${dist}`);
      }
    }

    if (trans) {
      if (/recommended transport:/i.test(trans)) {
        parts.push(trans);
      } else {
        parts.push(`Recommended transport: ${trans}`);
      }
    }

    return parts.join(". ");
  }

  const distanceTransportText = buildDistanceTransport();

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-slate-900">
          {name}
        </div>
        {rating != null && rating !== "" && (
          <div className="text-xs text-amber-600 font-medium">
            ⭐ {Number(rating).toFixed(1)}
          </div>
        )}
      </div>

      {label && (
        <div className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-blue-50 text-blue-700 border border-blue-100">
          {label}
        </div>
      )}

      {type && (
        <div className="text-[11px] uppercase tracking-wide text-slate-500">
          {type}
        </div>
      )}

      {description && (
        <p className="text-sm text-slate-700">
          {description}
        </p>
      )}

      {famousFor && (
        <div className="text-xs text-slate-700 mt-1">
          ⭐ <span className="font-medium">Famous for:</span> {famousFor}
        </div>
      )}

      {whatToDo && (
        <div className="text-xs text-slate-700 mt-1">
          ✔️ <span className="font-medium">What to do:</span> {whatToDo}
        </div>
      )}

      {mustTryDish && (
        <div className="text-xs text-slate-700 mt-1">
          🍽 <span className="font-medium">Must-try:</span> {mustTryDish}
        </div>
      )}

      {recommendedDrink && (
        <div className="text-xs text-slate-700 mt-1">
          🥤 <span className="font-medium">Drink:</span> {recommendedDrink}
        </div>
      )}

      {address && (
        <div className="text-xs text-slate-500">
          {address}
        </div>
      )}

      {tip && (
        <div className="text-xs text-yellow-700 mt-1">
          💡 <span className="font-medium">Tip:</span> {tip}
        </div>
      )}

      {distanceTransportText && (
        <div className="text-xs text-slate-700 mt-1">
          {distanceTransportText}
        </div>
      )}

      <div className="flex items-center justify-between mt-1 text-xs text-slate-700">
        {Array.isArray(tags) && tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
        {cost != null && cost !== "" && (
          <div className="font-medium">
            ${Number(cost).toFixed(0)}
          </div>
        )}
      </div>
    </div>
  );
}
