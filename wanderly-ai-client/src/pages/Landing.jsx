import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Landing() {
  const { i18n } = useTranslation();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF7F2' }}>
      {/* Top Bar with Logo and Sign In */}
      <div className="flex justify-between items-center px-6 py-4">
        <h1 className="text-2xl font-bold" style={{ color: '#1E1E1E' }}>
          Wanderly AI
        </h1>
        <Link 
          to="#" 
          className="text-sm hover:underline" 
          style={{ color: '#1E1E1E' }}
        >
          Sign in
        </Link>
      </div>

      {/* Main Content Card - Centered */}
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-6 py-12">
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12 relative overflow-hidden">
            {/* Subtle background shape */}
            <div 
              className="absolute top-0 right-0 w-64 h-64 opacity-10 -translate-y-1/2 translate-x-1/2 rounded-full blur-3xl"
              style={{ backgroundColor: '#EFBF3D' }}
            />
            
            <div className="relative z-10 text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#1E1E1E' }}>
                Discover your next adventure
              </h2>
              <p className="text-lg md:text-xl mb-8" style={{ color: '#1E1E1E' }}>
                Plan smarter with AI-powered trip planning that knows your style.
              </p>
              
          {/* Get Started Button */}
          <Link
            to="/hotels"
            className="inline-block px-8 py-4 rounded-lg text-white font-semibold text-lg transition-colors duration-200 hover:shadow-lg"
            style={{
              backgroundColor: '#EFBF3D',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#D9AD31';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#EFBF3D';
            }}
          >
            Get Started
          </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

