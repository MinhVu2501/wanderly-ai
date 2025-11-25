import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
// import Home from './pages/Home.jsx'; // Temporarily disabled search/food explore page
import PlaceDetails from './pages/PlaceDetails.jsx';
import AddPlace from './pages/AddPlace.jsx';
import TripPlanner from './pages/TripPlanner.jsx';
import Landing from './pages/Landing.jsx';
import HotelSelection from './pages/HotelSelection.jsx';
import Header from './components/Header.jsx';

function AppContent() {
  const location = useLocation();
  const showHeader = location.pathname !== '/';

  return (
    <>
      {showHeader && <Header />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/hotels" element={<HotelSelection />} />
        <Route path="/planner" element={<TripPlanner />} />
        {/* Keep the old Home (search/food) route commented for later re-enable */}
        {/* <Route path="/explore" element={<Home />} /> */}
        <Route path="/place/:id" element={<PlaceDetails />} />
        <Route path="/add" element={<AddPlace />} />
        <Route path="*" element={<div className="p-6">404 – Not Found</div>} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
