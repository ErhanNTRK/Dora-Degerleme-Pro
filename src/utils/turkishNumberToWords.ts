const ONES = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
const TENS = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
const SCALES = ['', 'Bin', 'Milyon', 'Milyar', 'Trilyon'];

function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const tens = Math.floor(remainder / 10);
  const ones = remainder % 10;

  let out = '';
  if (hundreds > 0) {
    out += (hundreds === 1 ? '' : ONES[hundreds] + ' ') + 'Yüz';
  }
  if (tens > 0) {
    out += (out ? ' ' : '') + TENS[tens];
  }
  if (ones > 0) {
    out += (out ? ' ' : '') + ONES[ones];
  }
  return out;
}

/** Tam sayı kısmını Türkçe kelimelere çevirir (ör. 25000 -> "Yirmi Beş Bin"). */
export function integerToTurkishWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'Sıfır';

  const groups: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    if (group === 0) continue;
    const groupWords = threeDigitsToWords(group);
    if (i === 1 && group === 1) {
      // "bir bin" yerine sade "Bin" kullanılır
      parts.push('Bin');
    } else {
      parts.push(groupWords + (SCALES[i] ? ' ' + SCALES[i] : ''));
    }
  }
  return parts.join(' ').trim();
}

/** Tutarı "(Yirmi Beş Bin Türk Lirası)" biçiminde yazıya çevirir. Kuruş varsa ayrıca belirtilir. */
export function amountToTurkishWords(amount: number): string {
  const lira = Math.floor(Math.abs(amount));
  const kurus = Math.round((Math.abs(amount) - lira) * 100);

  const liraWords = `${integerToTurkishWords(lira)} Türk Lirası`;
  if (kurus > 0) {
    return `(${liraWords} ${integerToTurkishWords(kurus)} Kuruş)`;
  }
  return `(${liraWords})`;
}
