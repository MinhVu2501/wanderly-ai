 import React from 'react';

export default function AISummaryCard({ item, lang = 'en', onClick, selected = false }) {
	const name = lang === 'vi' ? item?.name_vi : item?.name_en;
	const summary = lang === 'vi' ? item?.summary_vi : item?.summary_en;
	const wait = item?.estimated_wait_minutes;

	return (
		<div
			className={`bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition border cursor-pointer ${
				selected ? 'ring-2 ring-[#1F8EF1] border-[#1F8EF1]' : ''
			}`}
			onClick={onClick}
		>
			<h3 className="text-lg font-bold mb-2">{name}</h3>
			{summary ? <p className="text-gray-700 mb-2">{summary}</p> : null}
			{typeof wait === 'number' ? (
				<p className="text-gray-500 font-medium">Estimated Waiting Time: {wait} min</p>
			) : null}
		</div>
	);
}


