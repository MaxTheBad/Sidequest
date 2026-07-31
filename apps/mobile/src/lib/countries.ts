import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";

countries.registerLocale(en);

export const COUNTRY_OPTIONS = Object.entries(countries.getNames("en", { select: "official" }))
  .map(([code, name]) => ({ code: code.toUpperCase(), name }))
  .sort((a, b) => a.name.localeCompare(b.name));
