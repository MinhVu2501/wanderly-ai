import React, { useEffect, useMemo, useRef } from 'react';
import AISummaryCard from './AISummaryCard.jsx';

export default function AISummaryList({ aiSummary = [], lang = 'en', onSelectName, selectedName }) {
	if (!Array.isArray(aiSummary) || aiSummary.length === 0) return null;
	const refs = useRef([]);
	const matchIndex = useMemo(() => {
		if (!selectedName) return -1;
		const target = selectedName.toLowerCase();
		return aiSummary.findIndex((it) => {
			const nm = (it?.name_en || it?.name_vi || '').toLowerCase();
			return nm && (nm.includes(target) || target.includes(nm));
		});
	}, [aiSummary, selectedName]);

	useEffect(() => {
		if (matchIndex >= 0 && refs.current[matchIndex]) {
			refs.current[matchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}, [matchIndex]);

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			{aiSummary.map((item, idx) => {
				const nm = item?.name_en || item?.name_vi;
				const isSel =
					selectedName &&
					nm &&
					(nm.toLowerCase().includes(selectedName.toLowerCase()) ||
						selectedName.toLowerCase().includes(nm.toLowerCase()));
				return (
					<div key={`${nm || idx}`} ref={(el) => (refs.current[idx] = el)}>
						<AISummaryCard
							item={item}
							lang={lang}
							onClick={() => onSelectName?.(nm)}
							selected={!!isSel}
						/>
					</div>
				);
			})}
		</div>
	);
}


