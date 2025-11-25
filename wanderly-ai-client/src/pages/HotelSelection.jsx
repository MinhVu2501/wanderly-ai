import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../lib/config.js';
import { useTranslation } from 'react-i18next';

export default function HotelSelection() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const [formValues, setFormValues] = useState({
    from: '',
    to: '',
    startDate: '',
    endDate: '',
    travelType: 'comfort',
    budget: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hotels, setHotels] = useState([]);
  const [selectedHotels, setSelectedHotels] = useState({});

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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!formValues.from || !formValues.to || !formValues.startDate || !formValues.endDate) {
      setError("Please fill in all required fields.");
      return;
    }

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
          language: i18n.language === 'vi' ? 'vi' : 'en',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch hotels');

      const hotelList = data?.hotels || [];
      setHotels(hotelList);

      // Pre-select first hotel for each day
      const numDays = getDaysBetween(formValues.startDate, formValues.endDate);
      const defaultHotel = hotelList[0] || {};
      const initialSelections = {};
      for (let i = 0; i < numDays; i++) {
        initialSelections[i] = defaultHotel?.id || '';
      }
      setSelectedHotels(initialSelections);
    } catch (e) {
      setError(e.message || 'Failed to fetch hotels');
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    // Prepare hotel data and navigate to trip planner
    const numDays = getDaysBetween(formValues.startDate, formValues.endDate);
    const hotelPerDay = [];
    
    for (let i = 0; i < numDays; i++) {
      const hotelId = selectedHotels[i] || selectedHotels[0] || hotels[0]?.id || '';
      const hotel = hotels.find((h) => h.id === hotelId) || hotels[0] || {};
      const normalizeNightly = (h) => {
        if (!h) return 0;
        if (typeof h.nightlyPrice === 'number') return h.nightlyPrice;
        if (typeof h.nightlyPrice === 'object' && h.nightlyPrice.amount != null) {
          return Number(h.nightlyPrice.amount) || 0;
        }
        return 0;
      };

      hotelPerDay.push({
        day: i + 1,
        date: addDays(formValues.startDate, i),
        hotelId: hotel.id || '',
        name: hotel.name || '',
        lat: hotel.lat || 0,
        lng: hotel.lng || 0,
        address: hotel.address || '',
        nightlyPrice: normalizeNightly(hotel),
        currency: hotel.currency || 'USD',
      });
    }

    // Navigate to trip planner with state
    navigate('/planner', {
      state: {
        formValues: {
          ...formValues,
          language: i18n.language === 'vi' ? 'vi' : 'en',
        },
        hotels: hotels,
        hotelPerDay: hotelPerDay,
      },
    });
  }

  const numDays = hotels.length > 0 ? getDaysBetween(formValues.startDate, formValues.endDate) : 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF7F2' }}>
      <div className="p-6 max-w-4xl mx-auto">
        {hotels.length === 0 && (
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/')}
              className="px-3 py-1 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          </div>
        )}

        {/* Trip Details Form */}
        {hotels.length === 0 && (
          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4" style={{ color: '#1E1E1E' }}>Trip Details</h2>
              
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="From (city or airport)"
                  value={formValues.from}
                  onChange={(e) => setFormValues({ ...formValues, from: e.target.value })}
                  required
                  className="border p-2 w-full rounded bg-white"
                  disabled={loading}
                />
                <input
                  type="text"
                  placeholder="To (destination city)"
                  value={formValues.to}
                  onChange={(e) => setFormValues({ ...formValues, to: e.target.value })}
                  required
                  className="border p-2 w-full rounded bg-white"
                  disabled={loading}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#1E1E1E' }}>Start Date</label>
                    <input
                      type="date"
                      value={formValues.startDate}
                      onChange={(e) => setFormValues({ ...formValues, startDate: e.target.value })}
                      required
                      className="border p-2 w-full rounded bg-white"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#1E1E1E' }}>End Date</label>
                    <input
                      type="date"
                      value={formValues.endDate}
                      onChange={(e) => setFormValues({ ...formValues, endDate: e.target.value })}
                      required
                      className="border p-2 w-full rounded bg-white"
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#1E1E1E' }}>Travel Type</label>
                    <select
                      value={formValues.travelType}
                      onChange={(e) => setFormValues({ ...formValues, travelType: e.target.value })}
                      className="border p-2 w-full rounded bg-white"
                      disabled={loading}
                    >
                      <option value="economy">Economy</option>
                      <option value="comfort">Comfort</option>
                      <option value="premium">Premium</option>
                      <option value="luxury">Luxury</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#1E1E1E' }}>Budget (USD)</label>
                    <input
                      type="number"
                      placeholder="Budget"
                      value={formValues.budget}
                      onChange={(e) => setFormValues({ ...formValues, budget: e.target.value })}
                      className="border p-2 w-full rounded bg-white"
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-4 text-white px-6 py-2 rounded-lg font-semibold transition-colors duration-200"
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
            </div>
          </form>
        )}

        {/* Hotel Selection */}
        {hotels.length > 0 && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="space-y-4">
                {Array.from({ length: numDays }, (_, i) => {
                  const date = addDays(formValues.startDate, i);
                  const selectedHotelId = selectedHotels[i] || selectedHotels[0] || hotels[0]?.id || '';

                  return (
                    <div key={i} className="border-b pb-4 last:border-b-0">
                      <h3 className="font-semibold mb-4" style={{ color: '#1E1E1E' }}>
                        Day {i + 1} — {date}
                      </h3>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {hotels.map((h) => {
                          const isSelected = selectedHotelId === h.id;
                          const nightlyPrice = typeof h.nightlyPrice === 'number' 
                            ? h.nightlyPrice 
                            : h.nightlyPrice?.amount || 0;
                          
                          return (
                            <div
                              key={h.id}
                              onClick={() => {
                                setSelectedHotels({ ...selectedHotels, [i]: h.id });
                              }}
                              className={`border rounded-lg p-4 cursor-pointer transition-all shadow-sm ${
                                isSelected 
                                  ? 'border-2 shadow-md' 
                                  : 'border-gray-300 hover:shadow-md'
                              }`}
                              style={{
                                borderColor: isSelected ? '#EFBF3D' : undefined,
                                backgroundColor: isSelected ? '#FEF9E7' : '#FFFFFF',
                              }}
                            >
                              <div className="font-semibold mb-1" style={{ color: '#1E1E1E' }}>{h.name}</div>
                              <div className="text-sm mb-2" style={{ color: '#666' }}>{h.area || h.address}</div>
                              <div className="text-sm" style={{ color: '#1E1E1E' }}>
                                ⭐ {h.rating || 'N/A'} · ${nightlyPrice} / night
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    setHotels([]);
                    setSelectedHotels({});
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                  style={{ color: '#1E1E1E' }}
                >
                  Back
                </button>
                <button
                  onClick={handleContinue}
                  className="px-6 py-2 rounded-lg text-white font-semibold transition-colors duration-200 ml-auto"
                  style={{ backgroundColor: '#EFBF3D' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#D9AD31';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#EFBF3D';
                  }}
                >
                  Continue to Trip Planner
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

