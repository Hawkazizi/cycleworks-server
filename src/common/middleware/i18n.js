import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supported languages
const SUPPORTED_LANGS = ["fa", "en", "tr"];
const DEFAULT_LANG = "fa";

// Cache for loaded locales
const locales = {};

// Load all locale files once at startup
function loadLocales() {
  const localesDir = path.join(__dirname, "..", "locales");

  for (const lang of SUPPORTED_LANGS) {
    const filePath = path.join(localesDir, `${lang}.json`);
    try {
      const content = fs.readFileSync(filePath, "utf8");
      locales[lang] = JSON.parse(content);
    } catch (err) {
      console.warn(`⚠️ Failed to load locale file for '${lang}':`, err.message);
      locales[lang] = {};
    }
  }
}

// Recursive key lookup with fallback
function translate(key, lang, params = {}) {
  const keys = key.split(".");
  let result = locales[lang] || locales[DEFAULT_LANG];

  for (const k of keys) {
    if (result && typeof result === "object" && k in result) {
      result = result[k];
    } else {
      // Fallback chain: current lang → default lang → return key
      if (lang !== DEFAULT_LANG) {
        return translate(key, DEFAULT_LANG, params);
      }
      return key;
    }
  }

  // Handle simple interpolation: {{param}}
  if (typeof result === "string" && Object.keys(params).length > 0) {
    return result.replace(
      /\{\{(\w+)\}\}/g,
      (_, param) => params[param] ?? `{{${param}}}`,
    );
  }

  return result;
}

// Express middleware
export default function i18nMiddleware(req, res, next) {
  // 1. Detect language: query > header > cookie > default
  const queryLang = req.query?.lang?.toLowerCase().slice(0, 2);
  const headerLang = req.headers?.["accept-language"]
    ?.split(",")[0]
    ?.toLowerCase()
    .slice(0, 2);

  const detected = queryLang || headerLang || DEFAULT_LANG;
  req.lang = SUPPORTED_LANGS.includes(detected) ? detected : DEFAULT_LANG;

  // 2. Attach translation helper to request
  req.t = (key, params = {}) => translate(key, req.lang, params);

  // 3. Optional: expose current lang in response headers (for debugging)
  res.setHeader("X-Response-Language", req.lang);

  next();
}

// Initialize locales on module load
loadLocales();

// Export for testing/direct use
export { translate, SUPPORTED_LANGS, DEFAULT_LANG };
