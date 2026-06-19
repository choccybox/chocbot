const ISO6391 = require("iso-639-1");

const languageChoices = [
  { name: "Albanian (sq)", value: "sq" },
  { name: "Arabic (ar)", value: "ar" },
  { name: "Bulgarian (bg)", value: "bg" },
  { name: "Catalan (ca)", value: "ca" },
  { name: "Chinese (zh)", value: "zh" },
  { name: "Czech (cs)", value: "cs" },
  { name: "Danish (da)", value: "da" },
  { name: "Dutch (nl)", value: "nl" },
  { name: "English (en)", value: "en" },
  { name: "Estonian (et)", value: "et" },
  { name: "Finnish (fi)", value: "fi" },
  { name: "French (fr)", value: "fr" },
  { name: "German (de)", value: "de" },
  { name: "Greek (el)", value: "el" },
  { name: "Hebrew (he)", value: "he" },
  { name: "Hindi (hi)", value: "hi" },
  { name: "Hungarian (hu)", value: "hu" },
  { name: "Indonesian (id)", value: "id" },
  { name: "Italian (it)", value: "it" },
  { name: "Japanese (ja)", value: "ja" },
  { name: "Korean (ko)", value: "ko" },
  { name: "Latvian (lv)", value: "lv" },
  { name: "Lithuanian (lt)", value: "lt" },
  { name: "Norwegian Bokmål (nb)", value: "nb" },
  { name: "Polish (pl)", value: "pl" },
  { name: "Portuguese (pt)", value: "pt" },
  { name: "Russian (ru)", value: "ru" },
  { name: "Slovak (sk)", value: "sk" },
  { name: "Slovenian (sl)", value: "sl" },
  { name: "Spanish (es)", value: "es" },
  { name: "Thai (th)", value: "th" },
  { name: "Turkish (tr)", value: "tr" },
  { name: "Ukrainian (uk)", value: "uk" },
  { name: "Vietnamese (vi)", value: "vi" },
];

const supportedLanguages = new Set(
  languageChoices.map((language) => language.value),
);

const languageAliases = {
  alb: "sq",
  sqi: "sq",
  ara: "ar",
  bul: "bg",
  cat: "ca",
  chi: "zh",
  zho: "zh",
  cn: "zh",
  cze: "cs",
  ces: "cs",
  dan: "da",
  dut: "nl",
  nld: "nl",
  eng: "en",
  est: "et",
  fin: "fi",
  fre: "fr",
  fra: "fr",
  ger: "de",
  deu: "de",
  gre: "el",
  ell: "el",
  iw: "he",
  heb: "he",
  hin: "hi",
  hun: "hu",
  ind: "id",
  ita: "it",
  jpn: "ja",
  kor: "ko",
  lav: "lv",
  lit: "lt",
  no: "nb",
  nor: "nb",
  nob: "nb",
  norwegian: "nb",
  "norwegian bokmal": "nb",
  "norwegian bokmål": "nb",
  pol: "pl",
  por: "pt",
  rus: "ru",
  slo: "sk",
  slk: "sk",
  slovakian: "sk",
  slv: "sl",
  spa: "es",
  tha: "th",
  tur: "tr",
  ukr: "uk",
  vie: "vi",
  vietnamese: "vi",
};

function getLanguageCode(input) {
  if (!input) return null;

  const lowerInput = input.toLowerCase().trim();
  const parentheticalCode = lowerInput.match(/\(([a-z]{2})\)$/)?.[1];
  if (parentheticalCode && supportedLanguages.has(parentheticalCode))
    return parentheticalCode;
  if (supportedLanguages.has(lowerInput)) return lowerInput;
  if (languageAliases[lowerInput]) return languageAliases[lowerInput];

  const code = ISO6391.getCode(lowerInput);
  if (supportedLanguages.has(code)) return code;
  if (languageAliases[code]) return languageAliases[code];

  return null;
}

function getLanguageAutocompleteChoices(input) {
  const search = (input || "").toLowerCase().trim();

  const exactCodeMatches = languageChoices.filter((language) =>
    language.value.startsWith(search),
  );
  const nameMatches = languageChoices.filter(
    (language) =>
      !exactCodeMatches.includes(language) &&
      language.name.toLowerCase().includes(search),
  );

  return [...exactCodeMatches, ...nameMatches].slice(0, 25);
}

function getSupportedLanguageCodes() {
  return languageChoices.map((language) => language.value);
}

function getLanguageName(code) {
  if (!code) return null;
  const match = languageChoices.find((l) => l.value === code.toLowerCase());
  return match ? match.name.replace(/ \(.*\)$/, "") : null;
}

module.exports = {
  languageChoices,
  supportedLanguages,
  getLanguageCode,
  getLanguageAutocompleteChoices,
  getSupportedLanguageCodes,
  getLanguageName,
};
