import { useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../lib/config.js';

export default function AddPlace() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [form, setForm] = useState({
		name_en: '',
		name_vi: '',
		category: '',
		description_en: '',
		description_vi: '',
		latitude: '',
		longitude: '',
		created_by: '',
	});

	const handleChange = (e) => {
		setForm({ ...form, [e.target.name]: e.target.value });
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		try {
			await axios.post(`${API_BASE}/api/places`, form);
			alert('Place added successfully!');
			navigate('/');
		} catch (err) {
			console.error(err);
			alert('Failed to add place.');
		}
	};

	return (
		<div className="max-w-md mx-auto p-6">
			<h2 className="text-xl font-bold mb-4">{t('add_place')}</h2>
			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<input name="name_en" placeholder="Name (English)" onChange={handleChange} className="border rounded p-2" />
				<input name="name_vi" placeholder="Tên (Tiếng Việt)" onChange={handleChange} className="border rounded p-2" />
				<input name="category" placeholder="Category" onChange={handleChange} className="border rounded p-2" />
				<textarea name="description_en" placeholder="Description (English)" onChange={handleChange} className="border rounded p-2" />
				<textarea name="description_vi" placeholder="Mô tả (Tiếng Việt)" onChange={handleChange} className="border rounded p-2" />
				<input name="latitude" placeholder="Latitude" onChange={handleChange} className="border rounded p-2" />
				<input name="longitude" placeholder="Longitude" onChange={handleChange} className="border rounded p-2" />
				<input name="created_by" placeholder="Your name" onChange={handleChange} className="border rounded p-2" />
				<button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
					{t('submit')}
				</button>
			</form>
		</div>
	);
}


