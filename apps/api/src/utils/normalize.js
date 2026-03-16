const BANGLA_DIGITS = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9"
};

export function toEnglishDigits(value = "") {
  return String(value)
    .split("")
    .map((char) => BANGLA_DIGITS[char] ?? char)
    .join("");
}

export function normalizeText(value = "") {
  return toEnglishDigits(value)
    .toLowerCase()
    .replace(/[()\[\],.;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStationName(name = "") {
  return normalizeText(name)
    .replace(/\b(bus stand|terminal|counter)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
