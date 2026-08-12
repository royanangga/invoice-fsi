const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'invoice_auth';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET belum diset di environment variables.');
  return secret;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch (e) {
    return null;
  }
}

// Express middleware: wajib login (role apa saja)
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const user = token ? verifyToken(token) : null;
  if (!user) return res.status(401).json({ error: 'Belum login' });
  req.user = user;
  next();
}

// Express middleware: wajib login DAN role tertentu
function requireRole(role) {
  return (req, res, next) => {
    requireAuth(req, res, (err) => {
      if (err) return next(err);
      if (req.user.role !== role) {
        return res.status(403).json({ error: `Hanya ${role} yang boleh melakukan ini` });
      }
      next();
    });
  };
}

module.exports = { COOKIE_NAME, hashPassword, verifyPassword, signToken, verifyToken, requireAuth, requireRole };
