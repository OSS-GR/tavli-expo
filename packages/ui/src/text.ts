/** Combining acute accent (Greek tonos after NFD). */
const TONOS = /́/g;

/**
 * Upper-case a label for display, for example a section title.
 *
 * Greek all-caps text drops the tonos: "Παιχνίδι" -> "ΠΑΙΧΝΙΔΙ", not
 * "ΠΑΙΧΝΊΔΙ". React Native does not do this for us. The dialytika stays
 * ("ϊ" -> "Ϊ").
 *
 * Known gap: a tonos that splits a diphthong ("τσάι") should turn into a
 * dialytika in caps ("ΤΣΑΪ"). Avoid such words in caps labels.
 */
export function displayCaps(text: string): string {
  return text.normalize('NFD').replace(TONOS, '').toUpperCase().normalize('NFC');
}
