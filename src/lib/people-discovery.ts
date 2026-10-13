export const GENDER_IDENTITY_OPTIONS = [
  "Woman",
  "Man",
  "Non-binary",
  "Genderqueer",
  "Genderfluid",
  "Agender",
  "Bigender",
  "Two-Spirit",
  "Demigirl",
  "Demiboy",
  "Trans woman",
  "Trans man",
  "Transfeminine",
  "Transmasculine",
  "Intersex",
  "Questioning",
  "Another identity",
  "Prefer not to say",
] as const;

export function ageFromBirthDate(value: string) {
  if (!value) return null;
  const birthDate = new Date(`${value}T12:00:00`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

export function discoveryLocationErrorMessage(error: { code?: number } | null | undefined) {
  if (error?.code === 1) return "Location access was denied. Allow location for QuestHat, then save again to join People discovery.";
  if (error?.code === 2) return "Your device could not determine a location. Check your device location services, then save again. Browser permission alone does not provide a location.";
  if (error?.code === 3) return "Getting your discovery location timed out. Save again when your device can determine a location.";
  return "Your discovery location could not be obtained. Check your device location services, then save again.";
}
