import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import en from '@/locales/en.json'
import pt from '@/locales/pt.json'

/**
 * i18n pt/en desde o nascimento (binding do produto). Recursos inline —
 * app pequeno, zero estado de loading; migra pra lazy/http se as chaves
 * crescerem. Detecção: localStorage > idioma do browser; fallback pt.
 */
void i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: { pt: { translation: pt }, en: { translation: en } },
		fallbackLng: 'pt',
		supportedLngs: ['pt', 'en'],
		nonExplicitSupportedLngs: true,
		interpolation: { escapeValue: false },
		detection: {
			order: ['localStorage', 'navigator'],
			lookupLocalStorage: 'coploy.ats.lang',
			caches: ['localStorage'],
		},
	})

export default i18n
