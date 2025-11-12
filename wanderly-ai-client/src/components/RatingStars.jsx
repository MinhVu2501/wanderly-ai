export default function RatingStars({ value }) {
	if (value == null) return <span className="text-gray-500">N/A</span>;
	const clamped = Math.max(0, Math.min(5, Math.round(Number(value))));
	return (
		<span aria-label={`Rating ${clamped} out of 5`}>
			{'★'.repeat(clamped)}
			{'☆'.repeat(5 - clamped)}
		</span>
	);
}


