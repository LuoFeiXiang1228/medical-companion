const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    const hash = crypto.createHash('sha256').update(password).digest();
    return crypto.timingSafeEqual(hash, Buffer.from(stored, 'hex'));
  }
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(stored);
  if (!match) return false;
  const hash = await scrypt(password, match[1], 32);
  return crypto.timingSafeEqual(hash, Buffer.from(match[2], 'hex'));
}

module.exports = { hashPassword, verifyPassword };
