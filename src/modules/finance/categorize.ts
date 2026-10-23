/**
 * Reading a bank's narration line the way a person would.
 *
 * Indian statements describe a payment as something like
 * "UPI-SWIGGY-SWIGGY8@YBL-YESB0YBLUPI-412345678901-PAYMENT FROM PHONE": the
 * merchant is in there, between reference numbers, bank codes and the VPA.
 * `cleanNarration` pulls out the name, and `suggestCategory` guesses where
 * the money went from well-known merchants and words.
 *
 * Both are guesses, made in plain sight: the import shows every one and lets
 * the person change it before anything is saved. Pure, so the browser runs
 * them on the preview and tests pin them down.
 */

/* --------------------------------------------------------- narration --- */

const JUNK_WORD =
  /^(upi|imps|neft|rtgs|pos|ach|nach|ecs|dr|cr|to|by|from|mmt|p2a|p2m|trf|transfer|payment|pymt|pay|paid|sent|using|via|na|null|bil|inb|onl|vps|ipay|ref|txn|ib|mob|mb|upiintent|intent|collect|req|request|phone|ph|ybl|okaxis|oksbi|okhdfcbank|okicici|apl|ibl|axl|paytm upi)$/i;

const BANK_NAME =
  /^(state bank|sbi|hdfc( bank)?|icici( bank)?|axis( bank)?|kotak( mahindra)?( bank)?|yes bank|paytm payments bank|airtel payments bank|punjab national|pnb|bank of baroda|canara( bank)?|union bank|idfc( first)?( bank)?|indusind( bank)?|federal bank|au small finance|bank of india)( ltd| limited)?$/i;

/** A word that carries no name: a reference, a masked card, an IFSC, a VPA. */
function isJunkWord(word: string): boolean {
  return (
    JUNK_WORD.test(word) ||
    /^\d[\d.,]*$/.test(word) ||
    /^[a-z]{4}0[a-z0-9]{6}$/i.test(word) ||
    /^[\dx*]{6,}$/i.test(word) ||
    word.includes('@')
  );
}

function titleCase(text: string): string {
  // Only shouting is recased; "McDonald's" and "iPhone" are left alone.
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/**
 * The name in a narration: "Swiggy" from the UPI line above, "Amazon Pay
 * India" from "POS 512345XXXXXX1234 AMAZON PAY INDIA". Anything that does not
 * look like a payment rail's line is returned as it was, tidied.
 */
export function cleanNarration(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text === '') return text;

  if (
    /^(atm|atw|nwd|eaw|cwdr)\b|\b(atm (wdl|withdrawal|cash)|cash (wdl|withdrawal))\b/i.test(text)
  ) {
    return 'ATM cash withdrawal';
  }
  if (!/\b(upi|imps|neft|rtgs|pos|ach|nach|ecs|mmt|bil|inb|vps|ipay)\b/i.test(text)) {
    return titleCase(text).slice(0, 240);
  }

  const parts = text
    .split(/[/\-|:*]+/)
    .map((part) =>
      part
        .split(' ')
        .filter((w) => w !== '' && !isJunkWord(w))
        .join(' ')
        .trim(),
    )
    .filter((part) => part.length >= 2 && /[a-z]{2,}/i.test(part));

  const name = parts.find((part) => !JUNK_WORD.test(part) && !BANK_NAME.test(part));
  if (name) return titleCase(name).slice(0, 240);

  // Only a VPA to go on: "rahul.sharma99@okaxis" reads as "Rahul Sharma".
  const vpa = /([a-z][a-z0-9._-]*)@[a-z]+/i.exec(text)?.[1];
  const fromVpa = vpa?.replace(/[\d._-]+/g, ' ').trim();
  if (fromVpa) return titleCase(fromVpa.toUpperCase()).slice(0, 240);

  return titleCase(text).slice(0, 240);
}

/**
 * One place, however the bank spelled it this time. Statements cut names
 * short, and not always at the same width ("Sunrise Beverag", "Sunrise
 * Beverage"), so the key is the name's first twelve letters and digits, and
 * two keys are the same place when one begins the other (see `samePlace`).
 * Choices the person makes for one payment are remembered, and applied, by
 * this key.
 */
export function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12);
}

/** A shorter key only stands for a longer one when it is long enough to be a name. */
const MIN_PREFIX = 8;

/** Whether two merchant keys are one place: equal, or one a long-enough start of the other. */
export function samePlace(a: string, b: string): boolean {
  if (a === b) return a !== '';
  if (Math.min(a.length, b.length) < MIN_PREFIX) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Each key mapped to the one that stands for its place: the longest key
 * it begins. "ravimartsto" and "ravimartstor" both map to "ravimartstor".
 */
export function canonicalKeys(keys: Iterable<string>): Map<string, string> {
  const unique = [...new Set(keys)].filter(Boolean).sort((a, b) => b.length - a.length);
  const roots: string[] = [];
  const out = new Map<string, string>();
  for (const key of unique) {
    const root = roots.find((r) => samePlace(r, key));
    if (root) {
      out.set(key, root);
    } else {
      roots.push(key);
      out.set(key, key);
    }
  }
  return out;
}

/* ---------------------------------------------------------- category --- */

/**
 * Checked in order, first match wins, so the specific comes before the
 * general: Swiggy Instamart is groceries before Swiggy is food, Amazon Prime
 * a subscription before Amazon is shopping, JioMart and Jio-bp before Jio.
 */
const RULES: readonly (readonly [string, RegExp])[] = [
  ['Cash', /\b(atm|atw|nwd|eaw|cash wdl|cash withdrawal)\b/],
  [
    'Subscriptions',
    /\b(netflix|spotify|hotstar|disney|prime video|amazon prime|primevideo|youtube premium|youtubepremium|sonyliv|sony liv|zee5|jiocinema|jiohotstar|apple com bill|itunes|google play|icloud|openai|chatgpt|microsoft|office 365|adobe|linkedin|audible|gaana|wynk)/,
  ],
  [
    'Groceries',
    /\b(bigbasket|bbnow|blinkit|grofers|zepto|instamart|dmart|avenue supermarts|jiomart|reliance fresh|reliance smart|smart bazaar|more retail|more supermarket|spencer|natures basket|ratnadeep|milkbasket|country delight|supermarket|hypermarket|grocer|kirana|provision|supermar|general store|departmental store|vegetable|fruits|dairy|super bazaar)|(?<!s)ma+rt\b/,
  ],
  [
    'Fuel',
    /\b(petrol|diesel|fuel|hpcl|hindustan petroleum|bpcl|bharat petroleum|iocl|indian oil|indianoil|shell|nayara|jio bp|jiobp|filling station|fuel station|cng)/,
  ],
  [
    'Travel',
    /\b(makemytrip|goibibo|cleartrip|yatra|ixigo|easemytrip|indigo|interglobe|air india|airindia|akasa|spicejet|vistara|irctc|redbus|abhibus|oyo|airbnb|booking com|agoda|treebo|fabhotels|zostel)/,
  ],
  [
    'Food',
    /\b(swiggy|zomato|eatsure|dominos|domino s|pizza|mcdonald|kfc|burger|starbucks|cafe|coffee|ccd|chaayos|haldiram|restaurant|dhaba|biryani|bakery|sweets|faasos|behrouz|box8|subway|dunkin|barbeque|bbq|food|kitchen|juice|rest(au|ur|ra)|hotel|bites|beverag|tiffin|canteen|bakers|tea stall|ice cream|icecream|dosa|idli|caterer|eatery|chicken|mutton)|\b(dine|eats|mess|meals|grill|cafeteria|chai|mandi)\b/,
  ],
  [
    'Transport',
    /\b(uber|ola|olacabs|rapido|namma yatri|nammayatri|blusmart|metro|fastag|toll|parking|bmtc|best bus|ksrtc|auto rickshaw|apsrtc|tsrtc|msrtc|gsrtc|upsrtc|rsrtc|hrtc|kstdc|srtc|transports?|travels|bus|cabs?|taxi)\b|\btranspor/,
  ],
  [
    'Books',
    /\b(crossword|sapna book|kindle|books?|bookstore|higginbotham|bookswagon|starmark|oxford bookstore)\b/,
  ],
  [
    'Shopping',
    /\b(amazon|amzn|flipkart|myntra|ajio|meesho|nykaa|tata cliq|tatacliq|croma|reliance digital|decathlon|ikea|lifestyle|pantaloons|westside|zara|max fashion|lenskart|firstcry|snapdeal|shoppers stop|trends|uniqlo|apple store|vijay sales)/,
  ],
  [
    'Bills',
    /\b(electricity|bescom|msedcl|mahadiscom|tneb|tangedco|tata power|adani electricity|bses|cesc|water bill|indane|hp gas|bharat gas|gas bill|airtel|jio|vodafone|vi|bsnl|act fibernet|broadband|recharge|dth|tata play|tatasky|dish tv|postpaid|prepaid|billdesk|bill pay|billpay)\b/,
  ],
  [
    'Bank charges',
    /\b(charges|chrg|chgs|chg|charge for|gst charge|program fee|processing fee|late fee|membership fee|card fee|sms alert|annual fee|amc|gst on|penalty|min bal|non maintenance)\b/,
  ],
  ['Rent', /\b(rent|nobroker|nestaway|housing com|maintenance|society)\b/],
  [
    'Health',
    /\b(apollo|pharma|pharmacy|medic|chemist|1mg|pharmeasy|netmeds|medplus|practo|hospita|clinic|diagnostic|thyrocare|lal path|dental|cult fit|cultfit|gym|fitness|medicine|drug|nursing home|optical|ayurved|homeo)|\b(med|meds)\b/,
  ],
  [
    'Entertainment',
    /\b(bookmyshow|pvr|inox|cinepolis|cinema|cineplex|multiplex|theatre|theater|paytm insider|steam|playstation|xbox|gaming|e sports|esports|bowling|amusement|wonderla|concert)/,
  ],
  [
    'Education',
    /\b(udemy|coursera|unacademy|byju|vedantu|upgrad|simplilearn|school|college|university|tuition|exam fee|academy|instit|coaching|polytechnic)|\bclasses\b/,
  ],
  [
    'Insurance',
    /\b(lic|insurance|policybazaar|hdfc life|icici pru|max life|star health|acko|digit)\b/,
  ],
  [
    'Investments',
    /\b(zerodha|groww|upstox|angel one|mutual fund|mutualfund|sip|nps|ppf|indian clearing corp|iccl|bse ltd|nse clearing)\b/,
  ],
  ['EMI & loans', /\b(emi|loan|bajaj finance|bajaj finserv|home credit)\b/],
];

/** Every name `suggestCategory` can return, in the order the rules use. */
export const AUTO_CATEGORIES: readonly string[] = RULES.map(([name]) => name);

/**
 * The category a payment probably belongs to, or null when nothing fits —
 * a UPI payment to a person is usually one of those, and is left for the
 * person to say. Only money going out is categorised.
 */
export function suggestCategory(narration: string, amountMinor: bigint): string | null {
  if (amountMinor >= 0n) return null;
  // The other side's bank is often named too ("... Airtel Payments Bank",
  // "priya@airtel") and is no clue to what was bought; the name before a
  // VPA's @ is.
  const text = ` ${narration
    .toLowerCase()
    .replace(/@[a-z0-9.]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')} `.replace(
    /\b(airtel|paytm|jio|fino|india post) payments? bank\b/g,
    ' ',
  );
  for (const [name, pattern] of RULES) {
    if (pattern.test(text)) return name;
  }
  return null;
}
