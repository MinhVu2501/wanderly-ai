import { useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../lib/config.js';

export default function SearchBar({ setResults, setLoading }) {
	const { t, i18n } = useTranslation();
	const [query, setQuery] = useState('');
	const [location, setLocation] = useState('');
	const [submitting, setSubmitting] = useState(false);

	const runSearch = async () => {
		try {
			setSubmitting(true);
			setLoading?.(true);
			const res = await axios.post(`${API_BASE}/api/ai/search`, {
				query,
				location,
				lang: i18n.language,
			});
			setResults(res.data);
		} catch (e) {
			console.error(e);
		} finally {
			setSubmitting(false);
			setLoading?.(false);
		}
	};

	const handleSubmit = async (e) => {
		e?.preventDefault();
		if (!query || !location) return runSearch(); // still allow; backend is resilient
		return runSearch();
	};

	return (
		<form onSubmit={handleSubmit} className="mt-6 flex items-center justify-center">
			<div className="w-full max-w-5xl flex gap-2 px-3 bg-white p-3 rounded-lg shadow-md border">
				<input
					type="text"
					placeholder={t('search_placeholder')}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="border border-gray-300 rounded-lg p-2 w-full md:w-1/2 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1F8EF1]"
				/>
				<input
					type="text"
					placeholder={t('location_zip_placeholder')}
					value={location}
					onChange={(e) => setLocation(e.target.value)}
					className="border border-gray-300 rounded-lg p-2 w-1/3 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1F8EF1]"
				/>
				<button
					type="submit"
					className="bg-[#1F8EF1] hover:bg-blue-600 transition text-white px-5 rounded-lg disabled:opacity-60"
					disabled={submitting}
				>
					{submitting ? t('searching') : t('search_button')}
				</button>
			</div>
		</form>
	);
}


