import { useEffect, useState } from 'react';
import axios from 'axios';
import TripItinerary from '../components/TripItinerary.jsx';
import { API_BASE } from '../lib/config.js';
import { useTranslation } from 'react-i18next';

export default function TripPlanner() {
  const { i18n } = useTranslation();
  const currencySymbols = {
    USD: '$',
    VND: '₫',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    SGD: 'S$',
    KRW: '₩',
  };
  const [form, setForm] = useState({
    destination: '',
    days: 3,
    interests: '',
    travelStyle: 'balanced',
    budget: '',
    currency: 'USD',
    language: 'en',
  });
  const [loading, setLoading] = useState(false);
  const [ctrl, setCtrl] = useState(null);
  const [plan, setPlan] = useState(null);
  const [rawText, setRawText] = useState('');
  const [warnings, setWarnings] = useState([]);

  // Keep form.language synced with global i18n selection
  useEffect(() => {
    const lang = i18n.language === 'vi' ? 'vi' : 'en';
    setForm((f) => (f.language === lang ? f : { ...f, language: lang }));
  }, [i18n.language]);

  // ❗ Auto-regenerate trip plan when language changes (only if a plan already exists)
  useEffect(() => {
    if (!plan) return;
    if (loading) return;
    const lang = i18n.language === 'vi' ? 'vi' : 'en';
    // Skip if plan already in the correct language
    if (plan?.meta?.language === lang) return;
    // Only abort if a non-language-triggered request is currently running
    if (ctrl && !loading) {
      try { ctrl.abort(); } catch {}
    }
    const controller = new AbortController();
    setCtrl(controller);
    async function regenerate() {
      setLoading(true);
      try {
        const res = await axios.post(
          `${API_BASE}/api/trip-plan`,
          { ...form, language: lang },
          { signal: controller.signal }
        );
        const data = res.data || {};
        const nextPlan = data?.plan || data;
        setForm((f) => ({ ...f, language: lang }));
        setPlan(nextPlan);
        setWarnings(validatePlan(nextPlan));
        setRawText('');
      } catch (err) {
        console.error('Failed to regenerate in new language', err);
      } finally {
        setLoading(false);
      }
    }
    regenerate();
  }, [i18n.language]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    // cancel any in-flight request
    try { ctrl?.abort?.(); } catch {}
    const controller = new AbortController();
    setCtrl(controller);
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/trip-plan`, form, { signal: controller.signal });
      const data = res.data || {};
     
      console.log('🔥 TripPlanner received data from backend:', data);

      if (data.raw) {
        // Client-side sanitize/parse attempt before showing raw
        const cleaned = sanitizePotentialJson(data.raw);
        try {
          const parsed = cleaned ? JSON.parse(cleaned) : null;
          if (parsed) {
            setPlan(parsed);
            setRawText('');
            setWarnings(validatePlan(parsed));
          } else {
            setRawText(data.raw);
            setPlan(null);
            setWarnings([]);
          }
        } catch {
          setRawText(data.raw);
          setPlan(null);
          setWarnings([]);
        }
      } else {
        const nextPlan = data?.plan || data;
        setPlan(nextPlan);
        setRawText('');
        setWarnings(validatePlan(nextPlan));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to generate plan.');
    } finally {
      setLoading(false);
    }
  };

  // Local sanitizer mirrors backend to recover JSON-like responses
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
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Trip Planner</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor="destination" className="block text-sm font-medium text-slate-700">Place</label>
        <input
          id="destination"
          name="destination"
          value={form.destination}
          onChange={(e) => setForm({ ...form, destination: e.target.value })}
          placeholder="Where will you travel?"
          className="border p-2 w-full"
          disabled={loading}
        />
        <label htmlFor="days" className="block text-sm font-medium text-slate-700">Days</label>
        <input
          id="days"
          name="days"
          type="number"
          value={form.days}
          onChange={(e) => setForm({ ...form, days: parseInt(e.target.value) || 1 })}
          className="border p-2 w-24"
          disabled={loading}
        />
        <label htmlFor="interests" className="block text-sm font-medium text-slate-700">Interests</label>
        <input
          id="interests"
          name="interests"
          value={form.interests}
          onChange={(e) => setForm({ ...form, interests: e.target.value })}
          className="border p-2 w-full"
          disabled={loading}
        />
        {/* Helper hint removed as requested */}
        <div className="flex gap-2 items-center">
          <label htmlFor="budget" className="text-sm font-medium text-slate-700">Budget</label>
          <select
            name="currency"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="border p-2"
            aria-label="Currency"
            disabled={loading}
          >
            <option value="USD">USD</option>
            <option value="VND">VND</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="JPY">JPY</option>
            <option value="AUD">AUD</option>
            <option value="CAD">CAD</option>
            <option value="SGD">SGD</option>
            <option value="KRW">KRW</option>
          </select>
          <div className="flex items-center border rounded">
            <span className="px-2 text-slate-600">{currencySymbols[form.currency] || ''}</span>
            <input
              id="budget"
              name="budget"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
              placeholder="Amount"
              className="p-2 border-0 outline-none"
              inputMode="decimal"
              disabled={loading}
            />
          </div>
          {/* Language selector removed (use navbar switch) */}
          <button disabled={loading} className="bg-blue-500 text-white px-4 py-2 rounded">
            {loading ? 'Planning...' : 'Plan Trip'}
          </button>
        </div>
      </form>

      {rawText && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded p-3">
          AI returned invalid format. Please try again.
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-900 rounded p-3 text-sm">
          <div className="font-semibold mb-1">Validation warnings</div>
          <ul className="list-disc pl-5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {plan && <TripItinerary plan={plan} />}
    </div>
  );
}


