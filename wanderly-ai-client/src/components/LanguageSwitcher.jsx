import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
	const { i18n } = useTranslation();
	return (
		<button
			onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'vi' : 'en')}
			className="text-sm"
		>
			{i18n.language === 'en' ? '🇺🇸 EN' : '🇻🇳 VI'}
		</button>
	);
}


