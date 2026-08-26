// /src/components/InstallationTypeTag.jsx

import { getInstallationTypeAppearance } from "@/lib/installationTypeAppearance.js";

export default function InstallationTypeTag({ typeKey, label }) {
  if (!typeKey) return <span className="type-tag type-none">geen type</span>;

  const cls = getInstallationTypeAppearance(typeKey).className;

  return <span className={`type-tag ${cls}`}>{label || typeKey}</span>;
}
