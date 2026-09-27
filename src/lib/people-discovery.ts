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
