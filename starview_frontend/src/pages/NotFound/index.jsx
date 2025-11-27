import { Link } from 'react-router-dom';
import './styles.css';

function NotFoundPage() {
  return (
    <div className="not-found">
      <div className="not-found-content">
        {/* Large 404 number */}
        <div className="not-found-code">
          <span className="not-found-4">4</span>
          <span className="not-found-0">0</span>
          <span className="not-found-4">4</span>
        </div>

        {/* Main message */}
        <h1 className="not-found-title">
          Lost in <span className="not-found-highlight">Space</span>
        </h1>

        {/* Description */}
        <p className="not-found-message">
          The page you're looking for has drifted beyond the observable universe.
        </p>

        {/* Action */}
        <Link to="/" className="btn-primary">
          <i className="fa-regular fa-house"></i>
          Return Home
        </Link>

        {/* Subtle footer text */}
        <p className="not-found-hint">
          Or use the navigation above to find your way
        </p>
      </div>
    </div>
  );
}

export default NotFoundPage;
