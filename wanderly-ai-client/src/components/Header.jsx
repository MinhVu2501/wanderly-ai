import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function Header() {
	const { i18n } = useTranslation();

	const switchLang = () => {
		const newLang = i18n.language === 'en' ? 'vi' : 'en';
		i18n.changeLanguage(newLang);
	};

	return (
		<header className="bg-white sticky top-0 z-20 border-b shadow-md">
			<div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
				<Link to="/" className="font-bold text-xl text-slate-900" style={{ fontFamily: 'Poppins, Inter, sans-serif' }}>
					Wanderly AI
				</Link>
				<div className="flex gap-4 items-center">
					<Link to="/add" className="bg-[#F2B138] text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition">
						Add Place
					</Link>
					<button onClick={switchLang} className="px-2 py-1 rounded-lg border text-slate-700 hover:bg-slate-50">
						{i18n.language === 'en' ? '🇺🇸 EN' : '🇻🇳 VI'}
					</button>
				</div>
			</div>
		</header>
	);
}


