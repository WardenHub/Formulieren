// De sfeerbeelden naast elkaar; de gif zoals hij was en de webm zoals hij nu is.
//
// SSIM en PSNR zeggen dat het verschil niet te zien is, maar dat is een getal. Dit is de
// plek om er zelf naar te kijken, met de bestandsgrootte eronder. Openen met de dev-server
// op /tests/clip-quality-harness.html.

import ReactDOM from "react-dom/client";

import errorGif from "../src/assets/error.gif";
import errorWebm from "../src/assets/error.webm";
import loginGif from "../src/assets/login.gif";
import loginWebm from "../src/assets/login.webm";
import LoopingClip from "../src/components/LoopingClip.jsx";
import "../src/styles/layout.css";

const PAREN = [
  {
    naam: "error",
    gif: errorGif,
    webm: errorWebm,
    gifBytes: 6561 * 1024,
    webmBytes: 1683 * 1024,
    ssim: "0,968",
    psnr: "41,3 dB",
  },
  {
    naam: "login",
    gif: loginGif,
    webm: loginWebm,
    gifBytes: 395 * 1024,
    webmBytes: 208 * 1024,
    ssim: "0,993",
    psnr: "45,1 dB",
  },
];

function mb(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${Math.round(bytes / 1024)} kB`;
}

function Harness() {
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Sfeerbeelden; gif tegenover webm</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: 720, lineHeight: 1.6 }}>
        Links het origineel, rechts wat Ember nu laadt. Zelfde beeldmaat, zelfde aantal
        frames, zelfde snelheid; alleen de codering verschilt. Kijk naar de randen en de
        kleurovergangen; dat is waar een codec het eerst zichtbaar wordt.
      </p>

      {PAREN.map((paar) => (
        <section key={paar.naam} style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>{paar.naam}</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <figure style={{ margin: 0 }}>
              <img
                src={paar.gif}
                alt={`${paar.naam} als gif`}
                style={{ width: "100%", borderRadius: 12, display: "block" }}
              />
              <figcaption style={{ marginTop: 8, fontSize: 12.5, color: "var(--muted)" }}>
                gif; <strong>{mb(paar.gifBytes)}</strong>
              </figcaption>
            </figure>

            <figure style={{ margin: 0 }}>
              <LoopingClip
                webmSrc={paar.webm}
                gifSrc={paar.gif}
                alt={`${paar.naam} als webm`}
                style={{ width: "100%", borderRadius: 12, display: "block" }}
              />
              <figcaption style={{ marginTop: 8, fontSize: 12.5, color: "var(--muted)" }}>
                webm; <strong>{mb(paar.webmBytes)}</strong>
                {"  "}
                {(paar.gifBytes / paar.webmBytes).toFixed(1)}× kleiner, SSIM {paar.ssim}, PSNR{" "}
                {paar.psnr}
              </figcaption>
            </figure>
          </div>
        </section>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Harness />);
