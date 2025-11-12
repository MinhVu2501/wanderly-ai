import { useState } from 'react';
import SearchBar from '../components/SearchBar.jsx';
import PlaceCard from '../components/PlaceCard.jsx';
import MapView from '../components/MapView.jsx';
import { motion, AnimatePresence } from 'framer-motion';
 

export default function Home() {
	const [results, setResults] = useState(null);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(null);

	 

	return (
		<div className="p-6 max-w-6xl mx-auto">
			<SearchBar setResults={setResults} setLoading={setIsLoading} />
			{results && (
				<div className="mt-8 grid grid-cols-1 md:grid-cols-5 gap-6">
					<div className="md:col-span-3">
						<div className="overflow-hidden rounded-lg border">
							<MapView places={results.places} loading={isLoading} selectedIndex={selectedIndex} />
						</div>
					</div>
					<div className="md:col-span-2">
					<AnimatePresence>
						<motion.div
							key="summary"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.25 }}
						>
							<h2 className="text-lg font-semibold mb-2">AI Summary</h2>
							<p className="bg-white border rounded p-3 shadow-sm">
								{results.ai_summary || results.ai_summary_en || results.ai_summary_vi || 'No AI summary available.'}
							</p>
						</motion.div>
					</AnimatePresence>
					<h3 className="mt-6 font-bold">Places</h3>
					<AnimatePresence>
						<div className="grid sm:grid-cols-1 md:grid-cols-1 gap-4">
							{results.places.map((p, i) => (
								<PlaceCard
									key={p.id}
									place={p}
									index={i + 1}
									onClick={() => setSelectedIndex(i)}
									selected={selectedIndex === i}
								/>
							))}
						</div>
					</AnimatePresence>
					</div>
				</div>
			)}
			{isLoading && (
				<div className="mt-6 text-center text-sm text-gray-600">Loading AI results...</div>
			)}
		</div>
	);
}


