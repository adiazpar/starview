/* Starfield Background Component
 * Renders a dense animated CSS starfield with parallax layers and shooting stars.
 */

import './styles.css';

function Starfield() {
  return (
    <div className="starfield" aria-hidden="true">
      {/* Star layers - different sizes and speeds for parallax */}
      <div className="stars-sm"></div>
      <div className="stars-md"></div>
      <div className="stars-lg"></div>

      {/* Shooting stars */}
      <div className="shooting-star"></div>
      <div className="shooting-star"></div>
      <div className="shooting-star"></div>
      <div className="shooting-star"></div>
      <div className="shooting-star"></div>
    </div>
  );
}

export default Starfield;
