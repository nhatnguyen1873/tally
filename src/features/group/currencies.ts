import type { Option } from '../../ui/Field.tsx'

// ISO 4217 codes in current use. Intl lists many retired ones too.
const CURRENT =
  'AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN ' +
  'BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL ' +
  'GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF ' +
  'KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN ' +
  'MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD ' +
  'SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH ' +
  'UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG'

/** Listed first: where Tally's groups most often travel. */
const COMMON = ['VND', 'USD', 'EUR', 'JPY', 'KRW', 'THB', 'SGD', 'CNY', 'GBP', 'AUD']

const EURO_AREA = new Set('AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' '))
const BY_REGION: Record<string, string> = {
  VN: 'VND',
  US: 'USD',
  GB: 'GBP',
  AU: 'AUD',
  CA: 'CAD',
  NZ: 'NZD',
  SG: 'SGD',
  MY: 'MYR',
  TH: 'THB',
  ID: 'IDR',
  PH: 'PHP',
  JP: 'JPY',
  KR: 'KRW',
  CN: 'CNY',
  HK: 'HKD',
  TW: 'TWD',
  IN: 'INR',
  CH: 'CHF',
}

/** Đồng for Vietnamese, else the currency of the phone's region, else dollars. */
export function defaultCurrency(language: string, phoneLanguages: readonly string[]): string {
  if (language === 'vi') return 'VND'
  for (const tag of phoneLanguages) {
    try {
      const region = new Intl.Locale(tag).maximize().region
      if (!region) continue
      if (EURO_AREA.has(region)) return 'EUR'
      const code = BY_REGION[region]
      if (code) return code
    } catch {
      // Not a valid language tag; try the next one.
    }
  }
  return 'USD'
}

/** Currencies for a picker: the common ones first, then the rest by code. */
export function currencyOptions(label: (code: string) => string): Option[] {
  const supported = new Set(Intl.supportedValuesOf('currency'))
  const rest = CURRENT.split(' ').filter((code) => !COMMON.includes(code))
  return [...COMMON, ...rest]
    .filter((code) => supported.has(code))
    .map((code) => ({ value: code, label: label(code) }))
}
