import { motion } from 'framer-motion';
import { useState } from 'react';
import { API_BASE } from '../lib/config.js';
import RatingStars from './RatingStars.jsx';

export default function PlaceCard({ place, index, onClick, selected = false }) {
	const name = place.name ?? place.name_en ?? place.name_vi ?? 'Unknown';
	const rating = place.avg_rating ?? place.rating ?? null;
	const isNew = place.user_created === true;
	const [userWait, setUserWait] = useState('');
	const [submitMsg, setSubmitMsg] = useState('');

	return (
		<motion.div
			className={`border rounded p-3 my-2 bg-white shadow-sm hover:shadow-md transition cursor-pointer ${
				selected ? 'ring-2 ring-[#1F8EF1] border-[#1F8EF1]' : ''
			}`}
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25 }}
			onClick={onClick}
		>
			<div className="flex items-center gap-2">
				{typeof index === 'number' && <span className="num-badge">{index}</span>}
				<h4 className="font-bold">{name}</h4>
				{isNew && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">New</span>}
			</div>
			<p className="text-sm mt-1">
				Rating: <RatingStars value={rating} />
			</p>
			{place.comments?.length > 0 && (
				<ul className="text-sm text-gray-600 mt-2">
					{place.comments.map((c, i) => (
						<li key={i}>💬 {c.comment}</li>
					))}
				</ul>
			)}

			{/* Submit Wait Time (anonymous MVP) */}
			<div
				className="flex items-center gap-2 mt-3"
				onClick={(e) => {
					// Prevent parent card click from triggering map focus when interacting with inputs
					e.stopPropagation();
				}}
			>
				<input
					type="number"
					min="1"
					placeholder="Your wait time (min)"
					value={userWait}
					onChange={(e) => setUserWait(e.target.value)}
					className="border border-gray-300 rounded px-2 py-1 w-40"
				/>
				<button
					onClick={async () => {
						if (!userWait) return;
						setSubmitMsg('');
						try {
							const res = await fetch(`${API_BASE}/api/wait-time`, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									place_id: place.id,
									wait_minutes: parseInt(userWait, 10),
								}),
							});
							const data = await res.json();
							if (data?.success) {
								setSubmitMsg(data?.message || 'Thanks!');
								setUserWait('');
							} else {
								setSubmitMsg(data?.error || 'Failed to submit wait time.');
							}
						} catch (err) {
							setSubmitMsg('Failed to submit wait time.');
							console.error(err);
						}
					}}
					className="bg-[#1F8EF1] hover:bg-blue-600 text-white px-3 py-1 rounded"
				>
					Submit
				</button>
			</div>
			{submitMsg ? <p className="text-green-600 mt-1 text-sm">{submitMsg}</p> : null}
		</motion.div>
	);
}


