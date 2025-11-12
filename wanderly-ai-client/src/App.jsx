import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import PlaceDetails from './pages/PlaceDetails.jsx';
import AddPlace from './pages/AddPlace.jsx';
import Header from './components/Header.jsx';

export default function App() {
	return (
		<Router>
			<Header />
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="/place/:id" element={<PlaceDetails />} />
				<Route path="/add" element={<AddPlace />} />
				<Route path="*" element={<div className="p-6">404 – Not Found</div>} />
			</Routes>
		</Router>
	);
}
