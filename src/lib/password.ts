// No look-alike characters (0/O, 1/l/I), so a password read aloud or copied by hand works.
const LOWER = 'abcdefghjkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const ALL = LOWER + UPPER + DIGITS

function pick(chars: string, random: (max: number) => number): string {
  return chars[random(chars.length)]
}

function cryptoRandom(max: number): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % max
}

/** A temporary password with at least one lowercase letter, one capital and one digit. */
export function generateTempPassword(length = 10, random: (max: number) => number = cryptoRandom): string {
  const chars = [pick(LOWER, random), pick(UPPER, random), pick(DIGITS, random)]
  while (chars.length < length) chars.push(pick(ALL, random))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
