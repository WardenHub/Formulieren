import { useEffect, useState } from "react";

/* Of er internet is. Staat los van het component dat het toont, zodat fast refresh blijft
   werken; dezelfde afspraak als apiStartupLoaderState.js in de webapp. */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false
  );

  useEffect(() => {
    function bij() {
      setOnline(true);
    }
    function af() {
      setOnline(false);
    }

    window.addEventListener("online", bij);
    window.addEventListener("offline", af);

    return () => {
      window.removeEventListener("online", bij);
      window.removeEventListener("offline", af);
    };
  }, []);

  return online;
}
