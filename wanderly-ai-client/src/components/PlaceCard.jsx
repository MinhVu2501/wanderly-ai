import { motion } from 'framer-motion';
import RatingStars from './RatingStars.jsx';

export default function PlaceCard({ place, index, onClick, selected = false }) {
	const name = place.name ?? place.name_en ?? place.name_vi ?? 'Unknown';
	const rating = place.avg_rating ?? place.rating ?? null;
	const isNew = place.user_created === true;

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
		</motion.div>
	);
}


