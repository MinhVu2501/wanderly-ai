import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
	en: {
		translation: {
			search_placeholder: 'Search for food or places...',
			location_placeholder: 'Location',
			location_zip_placeholder: 'Location or zipcode',
			search_button: 'Search',
			searching: 'Searching...',
			add_place: 'Add New Place',
			comments: 'Comments',
			submit: 'Submit',
		},
	},
	vi: {
		translation: {
			search_placeholder: 'Tìm món ăn hoặc địa điểm...',
			location_placeholder: 'Địa điểm',
			location_zip_placeholder: 'Địa điểm hoặc mã bưu điện',
			search_button: 'Tìm kiếm',
			searching: 'Đang tìm...',
			add_place: 'Thêm địa điểm mới',
			comments: 'Bình luận',
			submit: 'Gửi',
		},
	},
};

i18n.use(initReactI18next).init({
	resources,
	lng: 'en',
	interpolation: { escapeValue: false },
});

export default i18n;


