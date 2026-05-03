import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";

countries.registerLocale(en);

export type CountryOption = { code: string; name: string };

export const COUNTRY_OPTIONS: CountryOption[] = Object.entries(countries.getNames("en", { select: "official" }))
  .map(([code, name]) => ({ code: code.toUpperCase(), name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function countryNameFromCode(code: string) {
  return COUNTRY_OPTIONS.find((country) => country.code === code.toUpperCase())?.name || code.toUpperCase();
}

export function countryCodeFromName(name: string) {
  const normalized = name.trim().toLowerCase();
  return COUNTRY_OPTIONS.find((country) => country.name.toLowerCase() === normalized)?.code || "";
}
