// /src/components/InstallationTypeTag.jsx

export default function InstallationTypeTag({ typeKey, label }) {
  if (!typeKey) return <span className="type-tag type-none">geen type</span>;

  const cls =
    typeKey === "BMI" ? "type-bmi" :
    typeKey === "BMI_OAI" ? "type-bmi-oai" :
    typeKey === "OAI_TYPE_B" ? "type-oai" :
    typeKey === "IBC" ? "type-ibc" :
    typeKey === "TELEFONIE" ? "type-telefonie" :
    typeKey === "CAMERA" ? "type-camera" :
    "type-unknown";

  return <span className={`type-tag ${cls}`}>{label || typeKey}</span>;
}
