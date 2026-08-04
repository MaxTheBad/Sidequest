import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";

countries.registerLocale(en);

export const COUNTRY_OPTIONS = Object.entries(countries.getNames("en", { select: "official" }))
  .map(([code, name]) => ({ code: code.toUpperCase(), name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function getCountryDisplayAbbreviation(alpha2Code?: string | null) {
  const alpha3 = alpha2Code ? countries.alpha2ToAlpha3(alpha2Code.toUpperCase()) : undefined;
  if (!alpha3) return "";
  return `${alpha3.charAt(0)}${alpha3.slice(1).toLowerCase()}`;
}
