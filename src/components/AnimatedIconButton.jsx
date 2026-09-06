import { useRef } from "react";
import { Link } from "react-router-dom";

// Ember laat zijn icoontjes bewegen zodra je een knop aanwijst, niet pas wanneer je de muis
// precies op het icoontje zet. De geanimeerde icoontjes zetten hun eigen hover uit zodra er
// een ref aan hangt, en verwachten dan dat de ouder start en stopt. Dat werd tot nu toe op
// elke knop opnieuw met de hand geschreven; hier staat het een keer.
//
// Toetsenbordgebruikers krijgen dezelfde beweging bij focus, zodat de knop ook zonder muis
// laat zien dat hij leeft.
export default function AnimatedIconButton({
  Icon,
  iconSize = 16,
  iconProps = {},
  to = null,
  children,
  className = "btn btn-secondary btn-compact",
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  type = "button",
  ...rest
}) {
  const iconRef = useRef(null);

  function start(event, handler) {
    iconRef.current?.startAnimation?.();
    handler?.(event);
  }

  function stop(event, handler) {
    iconRef.current?.stopAnimation?.();
    handler?.(event);
  }

  const handlers = {
    onMouseEnter: (event) => start(event, onMouseEnter),
    onMouseLeave: (event) => stop(event, onMouseLeave),
    onFocus: (event) => start(event, onFocus),
    onBlur: (event) => stop(event, onBlur),
  };

  const icon = Icon ? (
    <Icon ref={iconRef} size={iconSize} className="nav-anim-icon" {...iconProps} />
  ) : null;

  if (to) {
    return (
      <Link className={className} to={to} {...handlers} {...rest}>
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={className} {...handlers} {...rest}>
      {icon}
      {children}
    </button>
  );
}
