import { useRef } from "react";

import { HomeIcon } from "@/components/ui/home";

// Het woordmerk letter voor letter, zodat ze na elkaar kunnen opveren bij hover.
const BRAND_LETTERS = "Ember".split("");

/* Het woordmerk in de topbar is de weg naar home, maar dat was niet te zien; het stond er
   als tekst en de enige aanwijzing was de aanwijzer die van vorm veranderde.

   Nu veren de letters op, licht na elkaar, en schuift het huisje uit dat ook naast Home in
   het menu staat; hetzelfde icoon voor dezelfde betekenis. Het staat los in een eigen
   bestand omdat de harness in tests/ dezelfde knop toont, en twee kopieën van dezelfde
   markup drijven altijd uit elkaar. */
export default function BrandHomeButton({ onNavigate }) {
  const homeIconRef = useRef(null);

  return (
    <button
      type="button"
      className="brand"
      onClick={onNavigate}
      onMouseEnter={() => homeIconRef.current?.startAnimation?.()}
      onMouseLeave={() => homeIconRef.current?.stopAnimation?.()}
      onFocus={() => homeIconRef.current?.startAnimation?.()}
      onBlur={() => homeIconRef.current?.stopAnimation?.()}
      aria-label="Ember; naar home"
      title="Naar home"
    >
      <span className="brand-word" aria-hidden="true">
        {BRAND_LETTERS.map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="brand-letter"
            style={{ "--letter-index": index }}
          >
            {letter}
          </span>
        ))}
      </span>

      <span className="brand-home" aria-hidden="true">
        <HomeIcon ref={homeIconRef} size={15} />
      </span>
    </button>
  );
}
