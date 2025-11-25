import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function Header() {
	const { i18n } = useTranslation();

	const switchLang = () => {
		const newLang = i18n.language === 'en' ? 'vi' : 'en';
		i18n.changeLanguage(newLang);
	};

	return (
		<header className="bg-white sticky top-0 z-20 border-b shadow-sm" style={{ borderColor: '#E5E5E5' }}>
			<div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
				<Link 
					to="/" 
					className="font-bold text-xl" 
					style={{ 
						fontFamily: 'Poppins, Inter, sans-serif',
						color: '#1E1E1E'
					}}
				>
					Wanderly AI
				</Link>
				<div className="flex gap-4 items-center">
					<button 
						onClick={switchLang} 
						className="px-2 py-1 rounded-lg border transition-colors"
						style={{
							borderColor: '#D1D5DB',
							color: '#1E1E1E',
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.backgroundColor = '#F5F5F5';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.backgroundColor = 'transparent';
						}}
					>
						{i18n.language === 'en' ? '🇺🇸 EN' : '🇻🇳 VI'}
					</button>
				</div>
			</div>
		</header>
	);
}


