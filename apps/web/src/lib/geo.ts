/**
 * Country + subdivision data for signup (used by the country/state dropdowns and
 * stored on the profile for per-jurisdiction compliance). Country display NAMES
 * are resolved at runtime from the browser's Intl API, so we keep only ISO 3166-1
 * alpha-2 codes here. US states + Canadian provinces are listed for the dependent
 * "state/region" dropdown (the subdivisions that drive US/CA privacy-law nuance).
 */
const ISO_CODES =
  'AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PR PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VC VE VN VU WS YE ZA ZM ZW'.split(
    ' ',
  );

// Surfaced first in the dropdown (most common signups), then the rest A→Z.
const PINNED = ['US', 'CA', 'GB', 'AU'];

export interface Country {
  code: string;
  name: string;
}

export function countries(): Country[] {
  let nameOf: (code: string) => string;
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    nameOf = (c) => dn.of(c) || c;
  } catch {
    nameOf = (c) => c; // very old WebView fallback
  }
  const all = ISO_CODES.map((code) => ({ code, name: nameOf(code) }));
  const pinned = PINNED.map((c) => all.find((x) => x.code === c)).filter((x): x is Country => !!x);
  const rest = all.filter((x) => !PINNED.includes(x.code)).sort((a, b) => a.name.localeCompare(b.name));
  return [...pinned, ...rest];
}

export const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia',
  'Puerto Rico', 'Guam', 'U.S. Virgin Islands', 'American Samoa', 'Northern Mariana Islands',
];

export const CA_PROVINCES = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
  'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island',
  'Quebec', 'Saskatchewan', 'Yukon',
];

/** Subdivisions for the dependent dropdown, or null (free-form region) for other countries. */
export function subdivisions(countryCode: string): string[] | null {
  if (countryCode === 'US') return US_STATES;
  if (countryCode === 'CA') return CA_PROVINCES;
  return null;
}

/** The Terms/Privacy version users accept at signup — bump when the docs change. */
export const TERMS_VERSION = '2026-06-21';
