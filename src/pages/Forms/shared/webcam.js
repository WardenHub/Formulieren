// Camera op een laptop.
//
// Een telefoon opent zijn camera via capture="environment" op een file-input; een laptop negeert
// dat attribuut en toont gewoon de bestandskiezer. Daar is getUserMedia voor nodig, en dat heeft
// een paar scherpe randen die we een keer goed moeten hebben in plaats van per scherm opnieuw.

// De achtercamera blijft de voorkeur voor een tablet in het veld, maar een laptop heeft er geen.
// Vroeg een scherm environment als harde eis, dan kwam de toestemmingsvraag nog wel en viel de
// browser daarna terug op OverconstrainedError; er startte geen beeld en de melding zei niet
// waarom. Het is dus een voorkeur, met de gewone camera als terugval.
export async function requestWebcamStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch (e) {
    if (String(e?.name || "") !== "OverconstrainedError") throw e;
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

// Een geweigerde camera, een bezette camera en een ontbrekende camera vragen om een ander
// vervolg van de invuller. De browser geeft die drie als foutnaam terug; de bijbehorende message
// is vaak leeg of Engels.
export function webcamErrorText(e) {
  switch (String(e?.name || "")) {
    case "NotAllowedError":
    case "SecurityError":
      return "Toegang tot de camera is geweigerd. Sta de camera toe voor Ember in je browser en probeer opnieuw.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Er is geen camera gevonden op dit apparaat. Kies Bestanden om een foto toe te voegen.";
    case "NotReadableError":
    case "AbortError":
      return "De camera is in gebruik door een ander programma. Sluit dat programma en probeer opnieuw.";
    default:
      return String(e?.message || e || "Webcam openen mislukt.");
  }
}

// Start een stroom en controleer dat er ook echt beeld in zit; zonder beeldspoor blijft het
// venster zwart en is de bestandskiezer de betere weg.
export async function openWebcamStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Webcam wordt niet ondersteund door deze browser.");
  }

  const stream = await requestWebcamStream();

  if (!stream.getVideoTracks().length) {
    stopWebcamStream(stream);
    throw new Error("De camera leverde geen beeld. Kies Bestanden om een foto toe te voegen.");
  }

  return stream;
}

export function stopWebcamStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

// Zet het huidige beeld om in een bestand. De naam draagt het tijdstip, zodat meerdere foto's
// achter elkaar niet dezelfde naam krijgen.
export function captureVideoFrameToFile(video) {
  if (!video) throw new Error("Geen camerabeeld beschikbaar.");

  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context niet beschikbaar.");

  ctx.drawImage(video, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Foto maken mislukt."));
          return;
        }

        const naam = `foto-${new Date().toISOString().replaceAll(":", "-")}.jpg`;
        resolve(new File([blob], naam, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  });
}

// Een telefoon of tablet doet het met de eigen camera-app; die levert betere foto's dan een
// videoframe en kost geen extra scherm.
export function isProbablyMobileDevice() {
  if (typeof navigator === "undefined") return false;
  if (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform || "")) return true;

  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent || "");
}
