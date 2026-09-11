// Converts a rupee amount into words using the Indian numbering system
// (Lakh/Crore rather than Million/Billion) — used for the "Total Invoice
// Value [In Words]" line on generated invoices. No external library: the
// Indian grouping (crore,lakh,thousand,hundred) is small enough to hand-roll.
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return TENS[tens] + (ones ? " " + ONES[ones] : "");
}

function threeDigits(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundreds) parts.push(ONES[hundreds] + " Hundred");
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

// Whole-rupee part only, using the Indian crore/lakh/thousand/hundred grouping.
function integerToIndianWords(n) {
  if (n === 0) return "Zero";

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts = [];
  if (crore) parts.push(threeDigits(crore) + " Crore");
  if (lakh) parts.push(threeDigits(lakh) + " Lakh");
  if (thousand) parts.push(threeDigits(thousand) + " Thousand");
  if (hundred) parts.push(threeDigits(hundred));

  return parts.join(" ");
}

// e.g. amountInWords(274350) => "Rupees Two Lakh Seventy Four Thousand Three Hundred Fifty Only"
// amountInWords(274350.50) => "Rupees Two Lakh Seventy Four Thousand Three Hundred Fifty and Fifty Paise Only"
function amountInWords(amount) {
  const value = Math.round(Number(amount) * 100) / 100;
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);

  let words = "Rupees " + integerToIndianWords(rupees);
  if (paise > 0) {
    words += " and " + twoDigits(paise) + " Paise";
  }
  return words + " Only";
}

module.exports = { amountInWords, integerToIndianWords };
