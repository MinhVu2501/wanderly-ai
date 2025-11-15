import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
// import Home from './pages/Home.jsx'; // Temporarily disabled search/food explore page
import PlaceDetails from './pages/PlaceDetails.jsx';
import AddPlace from './pages/AddPlace.jsx';
import TripPlanner from './pages/TripPlanner.jsx';
import Header from './components/Header.jsx';

export default function App() {
  return (
		<Router>
			<Header />
			<Routes>
				{/* Make Trip Planner the homepage */}
				<Route path="/" element={<TripPlanner />} />
				{/* Keep the old Home (search/food) route commented for later re-enable */}
				{/* <Route path="/explore" element={<Home />} /> */}
				<Route path="/place/:id" element={<PlaceDetails />} />
				<Route path="/add" element={<AddPlace />} />
				<Route path="*" element={<div className="p-6">404 – Not Found</div>} />
			</Routes>
		</Router>
	);
}
