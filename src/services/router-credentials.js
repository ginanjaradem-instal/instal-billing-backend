const crypto = require('node:crypto');

function encryptionKey(env = process.env) {
  const value = env.MIKROTIK_ENCRYPTION_KEY || '';
  if (!/^[a-f\d]{64}$/i.test(value)) {
    throw new Error('MIKROTIK_ENCRYPTION_KEY must be a 64-character hexadecimal key');
  }
  return Buffer.from(value, 'hex');
}

function encryptPassword(password, env = process.env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

function decryptPassword(encrypted, env = process.env) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(env),
    Buffer.from(encrypted.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = { decryptPassword, encryptPassword };
