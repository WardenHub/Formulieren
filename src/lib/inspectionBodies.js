// Product-owner list; public websites, not guessed booking or login endpoints.
export const INSPECTION_BODIES = [
  { name: "Nederlandse Inspectie Maatschappij", url: "https://www.nimbv.nl/" },
  { name: "Lemaro", url: "https://lemaro.nl/" },
  { name: "Kiwa", url: "https://www.kiwa.com/nl/nl/diensten/inspectie/" },
  { name: "Normec", url: "https://normecgroup.com/nl-nl/" },
];
export function inspectionBodyWebsite(name) {
  return INSPECTION_BODIES.find((body) => body.name.toLowerCase() === String(name || "").trim().toLowerCase())?.url || null;
}
