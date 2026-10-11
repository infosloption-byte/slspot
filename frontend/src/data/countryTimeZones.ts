/*
 * ISO country names and IANA time-zone membership reference data.
 * Derived from https://github.com/ramazancetinkaya/global-timezone-tracker
 * The source data's MIT license is preserved in COUNTRY_TIME_ZONES_LICENSE.txt.
 * Only the country code, name, and zone identifiers are bundled; no runtime network access is used.
 */
export type CountryTimeZone = {
  code: string
  name: string
  timezones: string[]
}

export const COUNTRY_TIME_ZONES: CountryTimeZone[] = [
  {
    "code": "AF",
    "name": "Afghanistan",
    "timezones": [
      "Asia/Kabul"
    ]
  },
  {
    "code": "AX",
    "name": "Åland Islands",
    "timezones": [
      "Europe/Mariehamn"
    ]
  },
  {
    "code": "AL",
    "name": "Albania",
    "timezones": [
      "Europe/Tirane"
    ]
  },
  {
    "code": "DZ",
    "name": "Algeria",
    "timezones": [
      "Africa/Algiers"
    ]
  },
  {
    "code": "AD",
    "name": "Andorra",
    "timezones": [
      "Europe/Andorra"
    ]
  },
  {
    "code": "AO",
    "name": "Angola",
    "timezones": [
      "Africa/Luanda"
    ]
  },
  {
    "code": "AI",
    "name": "Anguilla",
    "timezones": [
      "America/Anguilla"
    ]
  },
  {
    "code": "AQ",
    "name": "Antarctica",
    "timezones": [
      "Antarctica/McMurdo",
      "Antarctica/Casey",
      "Antarctica/Davis",
      "Antarctica/DumontDUrville",
      "Antarctica/Mawson",
      "Antarctica/Palmer",
      "Antarctica/Rothera",
      "Antarctica/Syowa",
      "Antarctica/Troll",
      "Antarctica/Vostok"
    ]
  },
  {
    "code": "AG",
    "name": "Antigua & Barbuda",
    "timezones": [
      "America/Antigua"
    ]
  },
  {
    "code": "AR",
    "name": "Argentina",
    "timezones": [
      "America/Argentina/Buenos_Aires",
      "America/Argentina/Cordoba",
      "America/Argentina/Salta",
      "America/Argentina/Jujuy",
      "America/Argentina/Tucuman",
      "America/Argentina/Catamarca",
      "America/Argentina/La_Rioja",
      "America/Argentina/San_Juan",
      "America/Argentina/Mendoza",
      "America/Argentina/San_Luis",
      "America/Argentina/Rio_Gallegos",
      "America/Argentina/Ushuaia"
    ]
  },
  {
    "code": "AM",
    "name": "Armenia",
    "timezones": [
      "Asia/Yerevan"
    ]
  },
  {
    "code": "AW",
    "name": "Aruba",
    "timezones": [
      "America/Aruba"
    ]
  },
  {
    "code": "AU",
    "name": "Australia",
    "timezones": [
      "Australia/Lord_Howe",
      "Antarctica/Macquarie",
      "Australia/Hobart",
      "Australia/Melbourne",
      "Australia/Sydney",
      "Australia/Broken_Hill",
      "Australia/Brisbane",
      "Australia/Lindeman",
      "Australia/Adelaide",
      "Australia/Darwin",
      "Australia/Perth",
      "Australia/Eucla"
    ]
  },
  {
    "code": "AT",
    "name": "Austria",
    "timezones": [
      "Europe/Vienna"
    ]
  },
  {
    "code": "AZ",
    "name": "Azerbaijan",
    "timezones": [
      "Asia/Baku"
    ]
  },
  {
    "code": "BS",
    "name": "Bahamas",
    "timezones": [
      "America/Nassau"
    ]
  },
  {
    "code": "BH",
    "name": "Bahrain",
    "timezones": [
      "Asia/Bahrain"
    ]
  },
  {
    "code": "BD",
    "name": "Bangladesh",
    "timezones": [
      "Asia/Dhaka"
    ]
  },
  {
    "code": "BB",
    "name": "Barbados",
    "timezones": [
      "America/Barbados"
    ]
  },
  {
    "code": "BY",
    "name": "Belarus",
    "timezones": [
      "Europe/Minsk"
    ]
  },
  {
    "code": "BE",
    "name": "Belgium",
    "timezones": [
      "Europe/Brussels"
    ]
  },
  {
    "code": "BZ",
    "name": "Belize",
    "timezones": [
      "America/Belize"
    ]
  },
  {
    "code": "BJ",
    "name": "Benin",
    "timezones": [
      "Africa/Porto-Novo"
    ]
  },
  {
    "code": "BM",
    "name": "Bermuda",
    "timezones": [
      "Atlantic/Bermuda"
    ]
  },
  {
    "code": "BT",
    "name": "Bhutan",
    "timezones": [
      "Asia/Thimphu"
    ]
  },
  {
    "code": "BO",
    "name": "Bolivia",
    "timezones": [
      "America/La_Paz"
    ]
  },
  {
    "code": "BA",
    "name": "Bosnia & Herzegovina",
    "timezones": [
      "Europe/Sarajevo"
    ]
  },
  {
    "code": "BW",
    "name": "Botswana",
    "timezones": [
      "Africa/Gaborone"
    ]
  },
  {
    "code": "BR",
    "name": "Brazil",
    "timezones": [
      "America/Noronha",
      "America/Belem",
      "America/Fortaleza",
      "America/Recife",
      "America/Araguaina",
      "America/Maceio",
      "America/Bahia",
      "America/Sao_Paulo",
      "America/Campo_Grande",
      "America/Cuiaba",
      "America/Santarem",
      "America/Porto_Velho",
      "America/Boa_Vista",
      "America/Manaus",
      "America/Eirunepe",
      "America/Rio_Branco"
    ]
  },
  {
    "code": "GB",
    "name": "Britain (UK)",
    "timezones": [
      "Europe/London"
    ]
  },
  {
    "code": "IO",
    "name": "British Indian Ocean Territory",
    "timezones": [
      "Indian/Chagos"
    ]
  },
  {
    "code": "BN",
    "name": "Brunei",
    "timezones": [
      "Asia/Brunei"
    ]
  },
  {
    "code": "BG",
    "name": "Bulgaria",
    "timezones": [
      "Europe/Sofia"
    ]
  },
  {
    "code": "BF",
    "name": "Burkina Faso",
    "timezones": [
      "Africa/Ouagadougou"
    ]
  },
  {
    "code": "BI",
    "name": "Burundi",
    "timezones": [
      "Africa/Bujumbura"
    ]
  },
  {
    "code": "KH",
    "name": "Cambodia",
    "timezones": [
      "Asia/Phnom_Penh"
    ]
  },
  {
    "code": "CM",
    "name": "Cameroon",
    "timezones": [
      "Africa/Douala"
    ]
  },
  {
    "code": "CA",
    "name": "Canada",
    "timezones": [
      "America/St_Johns",
      "America/Halifax",
      "America/Glace_Bay",
      "America/Moncton",
      "America/Goose_Bay",
      "America/Blanc-Sablon",
      "America/Toronto",
      "America/Iqaluit",
      "America/Atikokan",
      "America/Winnipeg",
      "America/Resolute",
      "America/Rankin_Inlet",
      "America/Regina",
      "America/Swift_Current",
      "America/Edmonton",
      "America/Cambridge_Bay",
      "America/Inuvik",
      "America/Vancouver",
      "America/Creston",
      "America/Dawson_Creek",
      "America/Fort_Nelson",
      "America/Whitehorse",
      "America/Dawson"
    ]
  },
  {
    "code": "CV",
    "name": "Cape Verde",
    "timezones": [
      "Atlantic/Cape_Verde"
    ]
  },
  {
    "code": "BQ",
    "name": "Caribbean NL",
    "timezones": [
      "America/Kralendijk"
    ]
  },
  {
    "code": "KY",
    "name": "Cayman Islands",
    "timezones": [
      "America/Cayman"
    ]
  },
  {
    "code": "CF",
    "name": "Central African Rep.",
    "timezones": [
      "Africa/Bangui"
    ]
  },
  {
    "code": "TD",
    "name": "Chad",
    "timezones": [
      "Africa/Ndjamena"
    ]
  },
  {
    "code": "CL",
    "name": "Chile",
    "timezones": [
      "America/Santiago",
      "America/Coyhaique",
      "America/Punta_Arenas",
      "Pacific/Easter"
    ]
  },
  {
    "code": "CN",
    "name": "China",
    "timezones": [
      "Asia/Shanghai",
      "Asia/Urumqi"
    ]
  },
  {
    "code": "CX",
    "name": "Christmas Island",
    "timezones": [
      "Indian/Christmas"
    ]
  },
  {
    "code": "CC",
    "name": "Cocos (Keeling) Islands",
    "timezones": [
      "Indian/Cocos"
    ]
  },
  {
    "code": "CO",
    "name": "Colombia",
    "timezones": [
      "America/Bogota"
    ]
  },
  {
    "code": "KM",
    "name": "Comoros",
    "timezones": [
      "Indian/Comoro"
    ]
  },
  {
    "code": "CD",
    "name": "Congo (Dem. Rep.)",
    "timezones": [
      "Africa/Kinshasa",
      "Africa/Lubumbashi"
    ]
  },
  {
    "code": "CG",
    "name": "Congo (Rep.)",
    "timezones": [
      "Africa/Brazzaville"
    ]
  },
  {
    "code": "CK",
    "name": "Cook Islands",
    "timezones": [
      "Pacific/Rarotonga"
    ]
  },
  {
    "code": "CR",
    "name": "Costa Rica",
    "timezones": [
      "America/Costa_Rica"
    ]
  },
  {
    "code": "CI",
    "name": "Côte d’Ivoire",
    "timezones": [
      "Africa/Abidjan"
    ]
  },
  {
    "code": "HR",
    "name": "Croatia",
    "timezones": [
      "Europe/Zagreb"
    ]
  },
  {
    "code": "CU",
    "name": "Cuba",
    "timezones": [
      "America/Havana"
    ]
  },
  {
    "code": "CW",
    "name": "Curaçao",
    "timezones": [
      "America/Curacao"
    ]
  },
  {
    "code": "CY",
    "name": "Cyprus",
    "timezones": [
      "Asia/Nicosia",
      "Asia/Famagusta"
    ]
  },
  {
    "code": "CZ",
    "name": "Czech Republic",
    "timezones": [
      "Europe/Prague"
    ]
  },
  {
    "code": "DK",
    "name": "Denmark",
    "timezones": [
      "Europe/Copenhagen"
    ]
  },
  {
    "code": "DJ",
    "name": "Djibouti",
    "timezones": [
      "Africa/Djibouti"
    ]
  },
  {
    "code": "DM",
    "name": "Dominica",
    "timezones": [
      "America/Dominica"
    ]
  },
  {
    "code": "DO",
    "name": "Dominican Republic",
    "timezones": [
      "America/Santo_Domingo"
    ]
  },
  {
    "code": "TL",
    "name": "East Timor",
    "timezones": [
      "Asia/Dili"
    ]
  },
  {
    "code": "EC",
    "name": "Ecuador",
    "timezones": [
      "America/Guayaquil",
      "Pacific/Galapagos"
    ]
  },
  {
    "code": "EG",
    "name": "Egypt",
    "timezones": [
      "Africa/Cairo"
    ]
  },
  {
    "code": "SV",
    "name": "El Salvador",
    "timezones": [
      "America/El_Salvador"
    ]
  },
  {
    "code": "GQ",
    "name": "Equatorial Guinea",
    "timezones": [
      "Africa/Malabo"
    ]
  },
  {
    "code": "ER",
    "name": "Eritrea",
    "timezones": [
      "Africa/Asmara"
    ]
  },
  {
    "code": "EE",
    "name": "Estonia",
    "timezones": [
      "Europe/Tallinn"
    ]
  },
  {
    "code": "SZ",
    "name": "Eswatini (Swaziland)",
    "timezones": [
      "Africa/Mbabane"
    ]
  },
  {
    "code": "ET",
    "name": "Ethiopia",
    "timezones": [
      "Africa/Addis_Ababa"
    ]
  },
  {
    "code": "FK",
    "name": "Falkland Islands",
    "timezones": [
      "Atlantic/Stanley"
    ]
  },
  {
    "code": "FO",
    "name": "Faroe Islands",
    "timezones": [
      "Atlantic/Faroe"
    ]
  },
  {
    "code": "FJ",
    "name": "Fiji",
    "timezones": [
      "Pacific/Fiji"
    ]
  },
  {
    "code": "FI",
    "name": "Finland",
    "timezones": [
      "Europe/Helsinki"
    ]
  },
  {
    "code": "FR",
    "name": "France",
    "timezones": [
      "Europe/Paris"
    ]
  },
  {
    "code": "GF",
    "name": "French Guiana",
    "timezones": [
      "America/Cayenne"
    ]
  },
  {
    "code": "PF",
    "name": "French Polynesia",
    "timezones": [
      "Pacific/Tahiti",
      "Pacific/Marquesas",
      "Pacific/Gambier"
    ]
  },
  {
    "code": "TF",
    "name": "French S. Terr.",
    "timezones": [
      "Indian/Kerguelen"
    ]
  },
  {
    "code": "GA",
    "name": "Gabon",
    "timezones": [
      "Africa/Libreville"
    ]
  },
  {
    "code": "GM",
    "name": "Gambia",
    "timezones": [
      "Africa/Banjul"
    ]
  },
  {
    "code": "GE",
    "name": "Georgia",
    "timezones": [
      "Asia/Tbilisi"
    ]
  },
  {
    "code": "DE",
    "name": "Germany",
    "timezones": [
      "Europe/Berlin",
      "Europe/Busingen"
    ]
  },
  {
    "code": "GH",
    "name": "Ghana",
    "timezones": [
      "Africa/Accra"
    ]
  },
  {
    "code": "GI",
    "name": "Gibraltar",
    "timezones": [
      "Europe/Gibraltar"
    ]
  },
  {
    "code": "GR",
    "name": "Greece",
    "timezones": [
      "Europe/Athens"
    ]
  },
  {
    "code": "GL",
    "name": "Greenland",
    "timezones": [
      "America/Nuuk",
      "America/Danmarkshavn",
      "America/Scoresbysund",
      "America/Thule"
    ]
  },
  {
    "code": "GD",
    "name": "Grenada",
    "timezones": [
      "America/Grenada"
    ]
  },
  {
    "code": "GP",
    "name": "Guadeloupe",
    "timezones": [
      "America/Guadeloupe"
    ]
  },
  {
    "code": "GU",
    "name": "Guam",
    "timezones": [
      "Pacific/Guam"
    ]
  },
  {
    "code": "GT",
    "name": "Guatemala",
    "timezones": [
      "America/Guatemala"
    ]
  },
  {
    "code": "GG",
    "name": "Guernsey",
    "timezones": [
      "Europe/Guernsey"
    ]
  },
  {
    "code": "GN",
    "name": "Guinea",
    "timezones": [
      "Africa/Conakry"
    ]
  },
  {
    "code": "GW",
    "name": "Guinea-Bissau",
    "timezones": [
      "Africa/Bissau"
    ]
  },
  {
    "code": "GY",
    "name": "Guyana",
    "timezones": [
      "America/Guyana"
    ]
  },
  {
    "code": "HT",
    "name": "Haiti",
    "timezones": [
      "America/Port-au-Prince"
    ]
  },
  {
    "code": "HN",
    "name": "Honduras",
    "timezones": [
      "America/Tegucigalpa"
    ]
  },
  {
    "code": "HK",
    "name": "Hong Kong",
    "timezones": [
      "Asia/Hong_Kong"
    ]
  },
  {
    "code": "HU",
    "name": "Hungary",
    "timezones": [
      "Europe/Budapest"
    ]
  },
  {
    "code": "IS",
    "name": "Iceland",
    "timezones": [
      "Atlantic/Reykjavik"
    ]
  },
  {
    "code": "IN",
    "name": "India",
    "timezones": [
      "Asia/Kolkata"
    ]
  },
  {
    "code": "ID",
    "name": "Indonesia",
    "timezones": [
      "Asia/Jakarta",
      "Asia/Pontianak",
      "Asia/Makassar",
      "Asia/Jayapura"
    ]
  },
  {
    "code": "IR",
    "name": "Iran",
    "timezones": [
      "Asia/Tehran"
    ]
  },
  {
    "code": "IQ",
    "name": "Iraq",
    "timezones": [
      "Asia/Baghdad"
    ]
  },
  {
    "code": "IE",
    "name": "Ireland",
    "timezones": [
      "Europe/Dublin"
    ]
  },
  {
    "code": "IM",
    "name": "Isle of Man",
    "timezones": [
      "Europe/Isle_of_Man"
    ]
  },
  {
    "code": "IL",
    "name": "Israel",
    "timezones": [
      "Asia/Jerusalem"
    ]
  },
  {
    "code": "IT",
    "name": "Italy",
    "timezones": [
      "Europe/Rome"
    ]
  },
  {
    "code": "JM",
    "name": "Jamaica",
    "timezones": [
      "America/Jamaica"
    ]
  },
  {
    "code": "JP",
    "name": "Japan",
    "timezones": [
      "Asia/Tokyo"
    ]
  },
  {
    "code": "JE",
    "name": "Jersey",
    "timezones": [
      "Europe/Jersey"
    ]
  },
  {
    "code": "JO",
    "name": "Jordan",
    "timezones": [
      "Asia/Amman"
    ]
  },
  {
    "code": "KZ",
    "name": "Kazakhstan",
    "timezones": [
      "Asia/Almaty",
      "Asia/Qyzylorda",
      "Asia/Qostanay",
      "Asia/Aqtobe",
      "Asia/Aqtau",
      "Asia/Atyrau",
      "Asia/Oral"
    ]
  },
  {
    "code": "KE",
    "name": "Kenya",
    "timezones": [
      "Africa/Nairobi"
    ]
  },
  {
    "code": "KI",
    "name": "Kiribati",
    "timezones": [
      "Pacific/Tarawa",
      "Pacific/Kanton",
      "Pacific/Kiritimati"
    ]
  },
  {
    "code": "KP",
    "name": "Korea (North)",
    "timezones": [
      "Asia/Pyongyang"
    ]
  },
  {
    "code": "KR",
    "name": "Korea (South)",
    "timezones": [
      "Asia/Seoul"
    ]
  },
  {
    "code": "KW",
    "name": "Kuwait",
    "timezones": [
      "Asia/Kuwait"
    ]
  },
  {
    "code": "KG",
    "name": "Kyrgyzstan",
    "timezones": [
      "Asia/Bishkek"
    ]
  },
  {
    "code": "LA",
    "name": "Laos",
    "timezones": [
      "Asia/Vientiane"
    ]
  },
  {
    "code": "LV",
    "name": "Latvia",
    "timezones": [
      "Europe/Riga"
    ]
  },
  {
    "code": "LB",
    "name": "Lebanon",
    "timezones": [
      "Asia/Beirut"
    ]
  },
  {
    "code": "LS",
    "name": "Lesotho",
    "timezones": [
      "Africa/Maseru"
    ]
  },
  {
    "code": "LR",
    "name": "Liberia",
    "timezones": [
      "Africa/Monrovia"
    ]
  },
  {
    "code": "LY",
    "name": "Libya",
    "timezones": [
      "Africa/Tripoli"
    ]
  },
  {
    "code": "LI",
    "name": "Liechtenstein",
    "timezones": [
      "Europe/Vaduz"
    ]
  },
  {
    "code": "LT",
    "name": "Lithuania",
    "timezones": [
      "Europe/Vilnius"
    ]
  },
  {
    "code": "LU",
    "name": "Luxembourg",
    "timezones": [
      "Europe/Luxembourg"
    ]
  },
  {
    "code": "MO",
    "name": "Macau",
    "timezones": [
      "Asia/Macau"
    ]
  },
  {
    "code": "MG",
    "name": "Madagascar",
    "timezones": [
      "Indian/Antananarivo"
    ]
  },
  {
    "code": "MW",
    "name": "Malawi",
    "timezones": [
      "Africa/Blantyre"
    ]
  },
  {
    "code": "MY",
    "name": "Malaysia",
    "timezones": [
      "Asia/Kuala_Lumpur",
      "Asia/Kuching"
    ]
  },
  {
    "code": "MV",
    "name": "Maldives",
    "timezones": [
      "Indian/Maldives"
    ]
  },
  {
    "code": "ML",
    "name": "Mali",
    "timezones": [
      "Africa/Bamako"
    ]
  },
  {
    "code": "MT",
    "name": "Malta",
    "timezones": [
      "Europe/Malta"
    ]
  },
  {
    "code": "MH",
    "name": "Marshall Islands",
    "timezones": [
      "Pacific/Majuro",
      "Pacific/Kwajalein"
    ]
  },
  {
    "code": "MQ",
    "name": "Martinique",
    "timezones": [
      "America/Martinique"
    ]
  },
  {
    "code": "MR",
    "name": "Mauritania",
    "timezones": [
      "Africa/Nouakchott"
    ]
  },
  {
    "code": "MU",
    "name": "Mauritius",
    "timezones": [
      "Indian/Mauritius"
    ]
  },
  {
    "code": "YT",
    "name": "Mayotte",
    "timezones": [
      "Indian/Mayotte"
    ]
  },
  {
    "code": "MX",
    "name": "Mexico",
    "timezones": [
      "America/Mexico_City",
      "America/Cancun",
      "America/Merida",
      "America/Monterrey",
      "America/Matamoros",
      "America/Chihuahua",
      "America/Ciudad_Juarez",
      "America/Ojinaga",
      "America/Mazatlan",
      "America/Bahia_Banderas",
      "America/Hermosillo",
      "America/Tijuana"
    ]
  },
  {
    "code": "FM",
    "name": "Micronesia",
    "timezones": [
      "Pacific/Chuuk",
      "Pacific/Pohnpei",
      "Pacific/Kosrae"
    ]
  },
  {
    "code": "MD",
    "name": "Moldova",
    "timezones": [
      "Europe/Chisinau"
    ]
  },
  {
    "code": "MC",
    "name": "Monaco",
    "timezones": [
      "Europe/Monaco"
    ]
  },
  {
    "code": "MN",
    "name": "Mongolia",
    "timezones": [
      "Asia/Ulaanbaatar",
      "Asia/Hovd"
    ]
  },
  {
    "code": "ME",
    "name": "Montenegro",
    "timezones": [
      "Europe/Podgorica"
    ]
  },
  {
    "code": "MS",
    "name": "Montserrat",
    "timezones": [
      "America/Montserrat"
    ]
  },
  {
    "code": "MA",
    "name": "Morocco",
    "timezones": [
      "Africa/Casablanca"
    ]
  },
  {
    "code": "MZ",
    "name": "Mozambique",
    "timezones": [
      "Africa/Maputo"
    ]
  },
  {
    "code": "MM",
    "name": "Myanmar (Burma)",
    "timezones": [
      "Asia/Yangon"
    ]
  },
  {
    "code": "NA",
    "name": "Namibia",
    "timezones": [
      "Africa/Windhoek"
    ]
  },
  {
    "code": "NR",
    "name": "Nauru",
    "timezones": [
      "Pacific/Nauru"
    ]
  },
  {
    "code": "NP",
    "name": "Nepal",
    "timezones": [
      "Asia/Kathmandu"
    ]
  },
  {
    "code": "NL",
    "name": "Netherlands",
    "timezones": [
      "Europe/Amsterdam"
    ]
  },
  {
    "code": "NC",
    "name": "New Caledonia",
    "timezones": [
      "Pacific/Noumea"
    ]
  },
  {
    "code": "NZ",
    "name": "New Zealand",
    "timezones": [
      "Pacific/Auckland",
      "Pacific/Chatham"
    ]
  },
  {
    "code": "NI",
    "name": "Nicaragua",
    "timezones": [
      "America/Managua"
    ]
  },
  {
    "code": "NE",
    "name": "Niger",
    "timezones": [
      "Africa/Niamey"
    ]
  },
  {
    "code": "NG",
    "name": "Nigeria",
    "timezones": [
      "Africa/Lagos"
    ]
  },
  {
    "code": "NU",
    "name": "Niue",
    "timezones": [
      "Pacific/Niue"
    ]
  },
  {
    "code": "NF",
    "name": "Norfolk Island",
    "timezones": [
      "Pacific/Norfolk"
    ]
  },
  {
    "code": "MK",
    "name": "North Macedonia",
    "timezones": [
      "Europe/Skopje"
    ]
  },
  {
    "code": "MP",
    "name": "Northern Mariana Islands",
    "timezones": [
      "Pacific/Saipan"
    ]
  },
  {
    "code": "NO",
    "name": "Norway",
    "timezones": [
      "Europe/Oslo"
    ]
  },
  {
    "code": "OM",
    "name": "Oman",
    "timezones": [
      "Asia/Muscat"
    ]
  },
  {
    "code": "PK",
    "name": "Pakistan",
    "timezones": [
      "Asia/Karachi"
    ]
  },
  {
    "code": "PW",
    "name": "Palau",
    "timezones": [
      "Pacific/Palau"
    ]
  },
  {
    "code": "PS",
    "name": "Palestine",
    "timezones": [
      "Asia/Gaza",
      "Asia/Hebron"
    ]
  },
  {
    "code": "PA",
    "name": "Panama",
    "timezones": [
      "America/Panama"
    ]
  },
  {
    "code": "PG",
    "name": "Papua New Guinea",
    "timezones": [
      "Pacific/Port_Moresby",
      "Pacific/Bougainville"
    ]
  },
  {
    "code": "PY",
    "name": "Paraguay",
    "timezones": [
      "America/Asuncion"
    ]
  },
  {
    "code": "PE",
    "name": "Peru",
    "timezones": [
      "America/Lima"
    ]
  },
  {
    "code": "PH",
    "name": "Philippines",
    "timezones": [
      "Asia/Manila"
    ]
  },
  {
    "code": "PN",
    "name": "Pitcairn",
    "timezones": [
      "Pacific/Pitcairn"
    ]
  },
  {
    "code": "PL",
    "name": "Poland",
    "timezones": [
      "Europe/Warsaw"
    ]
  },
  {
    "code": "PT",
    "name": "Portugal",
    "timezones": [
      "Europe/Lisbon",
      "Atlantic/Madeira",
      "Atlantic/Azores"
    ]
  },
  {
    "code": "PR",
    "name": "Puerto Rico",
    "timezones": [
      "America/Puerto_Rico"
    ]
  },
  {
    "code": "QA",
    "name": "Qatar",
    "timezones": [
      "Asia/Qatar"
    ]
  },
  {
    "code": "RE",
    "name": "Réunion",
    "timezones": [
      "Indian/Reunion"
    ]
  },
  {
    "code": "RO",
    "name": "Romania",
    "timezones": [
      "Europe/Bucharest"
    ]
  },
  {
    "code": "RU",
    "name": "Russia",
    "timezones": [
      "Europe/Kaliningrad",
      "Europe/Moscow",
      "Europe/Kirov",
      "Europe/Volgograd",
      "Europe/Astrakhan",
      "Europe/Saratov",
      "Europe/Ulyanovsk",
      "Europe/Samara",
      "Asia/Yekaterinburg",
      "Asia/Omsk",
      "Asia/Novosibirsk",
      "Asia/Barnaul",
      "Asia/Tomsk",
      "Asia/Novokuznetsk",
      "Asia/Krasnoyarsk",
      "Asia/Irkutsk",
      "Asia/Chita",
      "Asia/Yakutsk",
      "Asia/Khandyga",
      "Asia/Vladivostok",
      "Asia/Ust-Nera",
      "Asia/Magadan",
      "Asia/Sakhalin",
      "Asia/Srednekolymsk",
      "Asia/Kamchatka",
      "Asia/Anadyr"
    ]
  },
  {
    "code": "RW",
    "name": "Rwanda",
    "timezones": [
      "Africa/Kigali"
    ]
  },
  {
    "code": "AS",
    "name": "Samoa (American)",
    "timezones": [
      "Pacific/Pago_Pago"
    ]
  },
  {
    "code": "WS",
    "name": "Samoa (western)",
    "timezones": [
      "Pacific/Apia"
    ]
  },
  {
    "code": "SM",
    "name": "San Marino",
    "timezones": [
      "Europe/San_Marino"
    ]
  },
  {
    "code": "ST",
    "name": "Sao Tome & Principe",
    "timezones": [
      "Africa/Sao_Tome"
    ]
  },
  {
    "code": "SA",
    "name": "Saudi Arabia",
    "timezones": [
      "Asia/Riyadh"
    ]
  },
  {
    "code": "SN",
    "name": "Senegal",
    "timezones": [
      "Africa/Dakar"
    ]
  },
  {
    "code": "RS",
    "name": "Serbia",
    "timezones": [
      "Europe/Belgrade"
    ]
  },
  {
    "code": "SC",
    "name": "Seychelles",
    "timezones": [
      "Indian/Mahe"
    ]
  },
  {
    "code": "SL",
    "name": "Sierra Leone",
    "timezones": [
      "Africa/Freetown"
    ]
  },
  {
    "code": "SG",
    "name": "Singapore",
    "timezones": [
      "Asia/Singapore"
    ]
  },
  {
    "code": "SK",
    "name": "Slovakia",
    "timezones": [
      "Europe/Bratislava"
    ]
  },
  {
    "code": "SI",
    "name": "Slovenia",
    "timezones": [
      "Europe/Ljubljana"
    ]
  },
  {
    "code": "SB",
    "name": "Solomon Islands",
    "timezones": [
      "Pacific/Guadalcanal"
    ]
  },
  {
    "code": "SO",
    "name": "Somalia",
    "timezones": [
      "Africa/Mogadishu"
    ]
  },
  {
    "code": "ZA",
    "name": "South Africa",
    "timezones": [
      "Africa/Johannesburg"
    ]
  },
  {
    "code": "GS",
    "name": "South Georgia & the South Sandwich Islands",
    "timezones": [
      "Atlantic/South_Georgia"
    ]
  },
  {
    "code": "SS",
    "name": "South Sudan",
    "timezones": [
      "Africa/Juba"
    ]
  },
  {
    "code": "ES",
    "name": "Spain",
    "timezones": [
      "Europe/Madrid",
      "Africa/Ceuta",
      "Atlantic/Canary"
    ]
  },
  {
    "code": "LK",
    "name": "Sri Lanka",
    "timezones": [
      "Asia/Colombo"
    ]
  },
  {
    "code": "BL",
    "name": "St Barthelemy",
    "timezones": [
      "America/St_Barthelemy"
    ]
  },
  {
    "code": "SH",
    "name": "St Helena",
    "timezones": [
      "Atlantic/St_Helena"
    ]
  },
  {
    "code": "KN",
    "name": "St Kitts & Nevis",
    "timezones": [
      "America/St_Kitts"
    ]
  },
  {
    "code": "LC",
    "name": "St Lucia",
    "timezones": [
      "America/St_Lucia"
    ]
  },
  {
    "code": "SX",
    "name": "St Maarten (Dutch)",
    "timezones": [
      "America/Lower_Princes"
    ]
  },
  {
    "code": "MF",
    "name": "St Martin (French)",
    "timezones": [
      "America/Marigot"
    ]
  },
  {
    "code": "PM",
    "name": "St Pierre & Miquelon",
    "timezones": [
      "America/Miquelon"
    ]
  },
  {
    "code": "VC",
    "name": "St Vincent",
    "timezones": [
      "America/St_Vincent"
    ]
  },
  {
    "code": "SD",
    "name": "Sudan",
    "timezones": [
      "Africa/Khartoum"
    ]
  },
  {
    "code": "SR",
    "name": "Suriname",
    "timezones": [
      "America/Paramaribo"
    ]
  },
  {
    "code": "SJ",
    "name": "Svalbard & Jan Mayen",
    "timezones": [
      "Arctic/Longyearbyen"
    ]
  },
  {
    "code": "SE",
    "name": "Sweden",
    "timezones": [
      "Europe/Stockholm"
    ]
  },
  {
    "code": "CH",
    "name": "Switzerland",
    "timezones": [
      "Europe/Zurich"
    ]
  },
  {
    "code": "SY",
    "name": "Syria",
    "timezones": [
      "Asia/Damascus"
    ]
  },
  {
    "code": "TW",
    "name": "Taiwan",
    "timezones": [
      "Asia/Taipei"
    ]
  },
  {
    "code": "TJ",
    "name": "Tajikistan",
    "timezones": [
      "Asia/Dushanbe"
    ]
  },
  {
    "code": "TZ",
    "name": "Tanzania",
    "timezones": [
      "Africa/Dar_es_Salaam"
    ]
  },
  {
    "code": "TH",
    "name": "Thailand",
    "timezones": [
      "Asia/Bangkok"
    ]
  },
  {
    "code": "TG",
    "name": "Togo",
    "timezones": [
      "Africa/Lome"
    ]
  },
  {
    "code": "TK",
    "name": "Tokelau",
    "timezones": [
      "Pacific/Fakaofo"
    ]
  },
  {
    "code": "TO",
    "name": "Tonga",
    "timezones": [
      "Pacific/Tongatapu"
    ]
  },
  {
    "code": "TT",
    "name": "Trinidad & Tobago",
    "timezones": [
      "America/Port_of_Spain"
    ]
  },
  {
    "code": "TN",
    "name": "Tunisia",
    "timezones": [
      "Africa/Tunis"
    ]
  },
  {
    "code": "TR",
    "name": "Turkey",
    "timezones": [
      "Europe/Istanbul"
    ]
  },
  {
    "code": "TM",
    "name": "Turkmenistan",
    "timezones": [
      "Asia/Ashgabat"
    ]
  },
  {
    "code": "TC",
    "name": "Turks & Caicos Is",
    "timezones": [
      "America/Grand_Turk"
    ]
  },
  {
    "code": "TV",
    "name": "Tuvalu",
    "timezones": [
      "Pacific/Funafuti"
    ]
  },
  {
    "code": "UG",
    "name": "Uganda",
    "timezones": [
      "Africa/Kampala"
    ]
  },
  {
    "code": "UA",
    "name": "Ukraine",
    "timezones": [
      "Europe/Simferopol",
      "Europe/Kyiv"
    ]
  },
  {
    "code": "AE",
    "name": "United Arab Emirates",
    "timezones": [
      "Asia/Dubai"
    ]
  },
  {
    "code": "US",
    "name": "United States",
    "timezones": [
      "America/New_York",
      "America/Detroit",
      "America/Kentucky/Louisville",
      "America/Kentucky/Monticello",
      "America/Indiana/Indianapolis",
      "America/Indiana/Vincennes",
      "America/Indiana/Winamac",
      "America/Indiana/Marengo",
      "America/Indiana/Petersburg",
      "America/Indiana/Vevay",
      "America/Chicago",
      "America/Indiana/Tell_City",
      "America/Indiana/Knox",
      "America/Menominee",
      "America/North_Dakota/Center",
      "America/North_Dakota/New_Salem",
      "America/North_Dakota/Beulah",
      "America/Denver",
      "America/Boise",
      "America/Phoenix",
      "America/Los_Angeles",
      "America/Anchorage",
      "America/Juneau",
      "America/Sitka",
      "America/Metlakatla",
      "America/Yakutat",
      "America/Nome",
      "America/Adak",
      "Pacific/Honolulu"
    ]
  },
  {
    "code": "UY",
    "name": "Uruguay",
    "timezones": [
      "America/Montevideo"
    ]
  },
  {
    "code": "UM",
    "name": "US minor outlying islands",
    "timezones": [
      "Pacific/Midway",
      "Pacific/Wake"
    ]
  },
  {
    "code": "UZ",
    "name": "Uzbekistan",
    "timezones": [
      "Asia/Samarkand",
      "Asia/Tashkent"
    ]
  },
  {
    "code": "VU",
    "name": "Vanuatu",
    "timezones": [
      "Pacific/Efate"
    ]
  },
  {
    "code": "VA",
    "name": "Vatican City",
    "timezones": [
      "Europe/Vatican"
    ]
  },
  {
    "code": "VE",
    "name": "Venezuela",
    "timezones": [
      "America/Caracas"
    ]
  },
  {
    "code": "VN",
    "name": "Vietnam",
    "timezones": [
      "Asia/Ho_Chi_Minh"
    ]
  },
  {
    "code": "VG",
    "name": "Virgin Islands (UK)",
    "timezones": [
      "America/Tortola"
    ]
  },
  {
    "code": "VI",
    "name": "Virgin Islands (US)",
    "timezones": [
      "America/St_Thomas"
    ]
  },
  {
    "code": "WF",
    "name": "Wallis & Futuna",
    "timezones": [
      "Pacific/Wallis"
    ]
  },
  {
    "code": "EH",
    "name": "Western Sahara",
    "timezones": [
      "Africa/El_Aaiun"
    ]
  },
  {
    "code": "YE",
    "name": "Yemen",
    "timezones": [
      "Asia/Aden"
    ]
  },
  {
    "code": "ZM",
    "name": "Zambia",
    "timezones": [
      "Africa/Lusaka"
    ]
  },
  {
    "code": "ZW",
    "name": "Zimbabwe",
    "timezones": [
      "Africa/Harare"
    ]
  }
]

export function timeZonesForCountry(countryCode: string | null | undefined): string[] {
  if (!countryCode) return []
  return COUNTRY_TIME_ZONES.find((country) => country.code === countryCode.toUpperCase())?.timezones ?? []
}

export function defaultTimeZoneForCountry(
  countryCode: string | null | undefined,
  preferredTimeZone?: string | null,
): string {
  const zones = timeZonesForCountry(countryCode)
  if (!zones.length) return ''
  if (preferredTimeZone && zones.includes(preferredTimeZone)) return preferredTimeZone

  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (browserTimeZone && zones.includes(browserTimeZone)) return browserTimeZone
  return zones[0] ?? ''
}
