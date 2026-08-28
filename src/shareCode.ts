/** Short, memorable codes for the send/get flow - the whole point is that
 * a person can read one out loud or type it without a paste buffer, unlike
 * a raw info_hash or a UUID. Not meant to be unguessable; it's a sharing
 * convenience layered on top of the real protocol, not a security
 * boundary. */

const ADJECTIVES = [
  "swift", "brave", "quiet", "bold", "lucky", "sunny", "clever", "gentle",
  "quick", "calm", "bright", "sharp", "steady", "eager", "vivid", "cosmic",
];

const NOUNS = [
  "otter", "falcon", "maple", "comet", "harbor", "ember", "willow", "canyon",
  "orbit", "tiger", "meadow", "lantern", "ridge", "raven", "delta", "prism",
];

export function generateShareCode(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const number = Math.floor(Math.random() * 90) + 10; // two digits, 10-99
  return `${adjective}-${noun}-${number}`;
}

const CODE_PATTERN = /^[a-z]+-[a-z]+-\d{2}$/;

export function isValidShareCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}
