import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../lib/config.js';

export default function PlaceDetails() {
	const { t, i18n } = useTranslation();
	const { id } = useParams();
	const [place, setPlace] = useState(null);
	const [comments, setComments] = useState([]);
	const [newComment, setNewComment] = useState({ user_name: '', comment: '', rating: 5 });

	useEffect(() => {
		const fetchPlace = async () => {
			const res = await axios.get(`${API_BASE}/api/places/${id}`);
			setPlace(res.data);
			const comRes = await axios.get(`${API_BASE}/api/comments/${id}`);
			setComments(comRes.data);
		};
		fetchPlace();
	}, [id]);

	const handleCommentSubmit = async (e) => {
		e.preventDefault();
		try {
			await axios.post(`${API_BASE}/api/comments`, { ...newComment, place_id: id });
			setComments((prev) => [newComment, ...prev]);
			setNewComment({ user_name: '', comment: '', rating: 5 });
		} catch (err) {
			console.error(err);
			alert('Failed to submit comment');
		}
	};

	if (!place) return <div>Loading...</div>;

	return (
		<div className="min-h-screen" style={{ backgroundColor: '#FAF7F2' }}>
			<div className="max-w-2xl mx-auto p-6">
				<h2 className="text-2xl font-bold mb-2" style={{ color: '#1E1E1E' }}>{i18n.language === 'en' ? place.name_en : place.name_vi}</h2>
				<p style={{ color: '#1E1E1E' }}>{i18n.language === 'en' ? place.description_en : place.description_vi}</p>
				<p style={{ color: '#1E1E1E' }}>Category: {place.category}</p>
				<p style={{ color: '#1E1E1E' }}>Average Rating: {place.avg_rating || 'N/A'}</p>

				<div className="mt-6">
					<h3 className="font-semibold" style={{ color: '#1E1E1E' }}>{t('comments')}</h3>
					<form onSubmit={handleCommentSubmit} className="flex flex-col gap-2 mt-2">
						<input
							name="user_name"
							placeholder="Your name"
							value={newComment.user_name}
							onChange={(e) => setNewComment({ ...newComment, user_name: e.target.value })}
							className="border rounded p-2 bg-white"
						/>
						<textarea
							name="comment"
							placeholder="Your comment"
							value={newComment.comment}
							onChange={(e) => setNewComment({ ...newComment, comment: e.target.value })}
							className="border rounded p-2 bg-white"
						/>
						<input
							type="number"
							name="rating"
							min="1"
							max="5"
							value={newComment.rating}
							onChange={(e) => setNewComment({ ...newComment, rating: parseInt(e.target.value) })}
							className="border rounded p-2 bg-white"
						/>
						<button 
							type="submit" 
							className="text-white px-4 py-2 rounded font-semibold transition-colors duration-200"
							style={{ backgroundColor: '#EFBF3D' }}
							onMouseEnter={(e) => {
								e.currentTarget.style.backgroundColor = '#D9AD31';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.backgroundColor = '#EFBF3D';
							}}
						>
							{t('submit')}
						</button>
					</form>

					<div className="mt-4">
						{comments.map((c, i) => (
							<div key={i} className="border rounded p-2 mb-2 bg-white">
								<p className="font-semibold" style={{ color: '#1E1E1E' }}>
									{c.user_name} ⭐ {c.rating}
								</p>
								<p style={{ color: '#1E1E1E' }}>{c.comment}</p>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}


