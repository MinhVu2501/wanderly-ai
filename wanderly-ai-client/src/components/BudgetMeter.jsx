import React from 'react';

export function BudgetWarning({ budgetStatus }) {
  if (!budgetStatus) return null;
  const msgs = {
    under: "Great! You’re under budget.",
    on_track: "Good! You’re on track with your budget.",
    over: "Warning: This trip goes over your budget.",
    way_over: "Danger: This trip is far above your budget!",
  };
  const bg = {
    under: 'bg-green-100',
    on_track: 'bg-yellow-100',
    over: 'bg-orange-100',
    way_over: 'bg-red-100',
  }[budgetStatus] || 'bg-gray-100';

  return (
    <div className={`${bg} px-4 py-3 rounded-lg mb-5 font-semibold text-slate-800`}>
      {msgs[budgetStatus] || ''}
    </div>
  );
}

export default function BudgetMeter({ costSummary }) {
  if (!costSummary) return null;
  const {
    totalEstimatedCost,
    budget,
    budgetUsedPercent = 0,
    budgetStatus,
    totalFlightCost,
    totalHotelCost,
    totalFoodCost,
    totalTransportCost,
    totalActivitiesCost,
  } = costSummary || {};

  const percent = Math.min(100, Math.max(0, Number(budgetUsedPercent) || 0));
  const colorClass =
    budgetStatus === 'under'
      ? 'bg-green-500'
      : budgetStatus === 'on_track'
      ? 'bg-yellow-400'
      : budgetStatus === 'over'
      ? 'bg-orange-500'
      : 'bg-red-600';

  return (
    <div className="mt-5 p-5 bg-white rounded-xl shadow-lg">
      <h2 className="text-lg font-semibold mb-3">💰 Budget Overview</h2>

      <div className="w-full h-4 bg-gray-200 rounded overflow-hidden mb-2">
        <div
          className={`h-full ${colorClass} transition-all`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="text-sm text-slate-700 mb-3">
        Used: ${totalEstimatedCost || 0} / ${budget || 0}
        <br />
        ({Math.round(percent)}% - {(budgetStatus || '').replace('_', ' ')})
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm text-slate-800">
        <div className="bg-gray-50 rounded-md px-3 py-2">✈️ Flight: ${Number(totalFlightCost || 0).toLocaleString()}</div>
        <div className="bg-gray-50 rounded-md px-3 py-2">🏨 Hotels: ${Number(totalHotelCost || 0).toLocaleString()}</div>
        <div className="bg-gray-50 rounded-md px-3 py-2">🍽 Food: ${Number(totalFoodCost || 0).toLocaleString()}</div>
        <div className="bg-gray-50 rounded-md px-3 py-2">🚕 Transport: ${Number(totalTransportCost || 0).toLocaleString()}</div>
        <div className="bg-gray-50 rounded-md px-3 py-2">🎟 Activities: ${Number(totalActivitiesCost || 0).toLocaleString()}</div>
      </div>
    </div>
  );
}
