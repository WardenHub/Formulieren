// Een lopende animatie zonder geluid, met de gif als terugval.
//
// De twee sfeerbeelden in Ember waren geanimeerde gifs van 6,4 MB en 395 kB. Een gif kan
// maar 256 kleuren per frame en doet niets met de gelijkenis tussen opeenvolgende frames;
// bij een film-achtige animatie van 25 beelden per seconde is dat duur. Dezelfde beelden
// als webm zijn respectievelijk 1,68 MB en 208 kB, met hetzelfde aantal frames, dezelfde
// beeldmaat en een gemeten SSIM van 0,97 tegenover het origineel.
//
// Animated webp is hier bewust niet gebruikt; dat werd bij q90 juist groter dan de gif.
//
// De browser haalt precies één bestand op: de webm als hij die kan spelen, anders de gif.
export default function LoopingClip({
  webmSrc,
  gifSrc,
  alt,
  className = "",
  style,
}) {
  return (
    <video
      className={className}
      style={style}
      // Zonder geluid, dus autoplay mag; playsinline houdt het op iOS in de pagina.
      autoPlay
      loop
      muted
      playsInline
      // Een sfeerbeeld hoeft niet aangeklikt te worden en is geen bedieningselement.
      disablePictureInPicture
      aria-label={alt}
      // De gif is de terugval voor een browser zonder webm; die wordt alleen dan gehaald.
      poster={undefined}
    >
      <source src={webmSrc} type="video/webm" />
      <img src={gifSrc} alt={alt} className={className} style={style} />
    </video>
  );
}
