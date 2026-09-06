import { useEffect, useState } from "react";

// Een foto bij een actiepunt wordt met een kortlopende verwijzing opgehaald. Waar die
// verwijzing vandaan komt verschilt per scherm; de installatietab gaat via de installatie, de
// Monitor via de formulierbron van het punt. Daarom komt het ophalen als functie binnen in
// plaats van dat dit component zelf een route kiest.
//
// De verwijzing is vijf minuten geldig en wordt onthouden. Zonder dat geheugen vraagt elke
// hertekening van de pagina een nieuwe aan; op een scherm dat een coordinator de hele ochtend
// open heeft staan zijn dat er honderden voor dezelfde foto.
const URL_CACHE = new Map();
const URL_TTL_MS = 4 * 60 * 1000;

function readCachedUrl(storedFileId) {
  const entry = URL_CACHE.get(storedFileId);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    URL_CACHE.delete(storedFileId);
    return null;
  }

  return entry.url;
}

export default function ActionPointPhoto({ loadUrl, file, onOpen }) {
  const storedFileId = String(file?.stored_file_id || "");

  const [renderedFileId, setRenderedFileId] = useState(storedFileId);
  const [url, setUrl] = useState(() => readCachedUrl(storedFileId));
  const [failed, setFailed] = useState(false);

  // Wisselt de kaart van foto, dan hoort de vorige verwijzing meteen weg. Dit is de
  // aangewezen manier om stand bij te stellen tijdens het renderen; in een effect zou de
  // oude foto eerst nog een keer in beeld komen.
  if (renderedFileId !== storedFileId) {
    setRenderedFileId(storedFileId);
    setUrl(readCachedUrl(storedFileId));
    setFailed(false);
  }

  useEffect(() => {
    if (!loadUrl || !storedFileId) return undefined;
    if (readCachedUrl(storedFileId)) return undefined;

    let alive = true;

    Promise.resolve()
      .then(() => loadUrl(storedFileId))
      .then((result) => {
        const nextUrl = result?.url || null;
        if (nextUrl) {
          URL_CACHE.set(storedFileId, { url: nextUrl, expiresAt: Date.now() + URL_TTL_MS });
        }
        if (alive) setUrl(nextUrl);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
    };
  }, [loadUrl, storedFileId]);

  if (failed) {
    return (
      <div className="action-point-photo action-point-photo--failed" title={file?.file_name || "Foto"}>
        <span>Niet beschikbaar</span>
      </div>
    );
  }

  if (!url) {
    return <div className="action-point-photo action-point-photo--loading" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      className="action-point-photo"
      onClick={() => onOpen?.(url, file)}
      title={file?.file_name || "Foto"}
    >
      <img src={url} alt={file?.file_name || "Foto bij actiepunt"} loading="lazy" />
    </button>
  );
}
