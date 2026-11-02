/**
 * The one operator account: whoever signs in with this email is always
 * promoted to admin, on top of the existing "first account on a fresh
 * install" rule in auth.js. Kept in its own module (no dependency on auth.js
 * or plans.js) so neither has to import the other.
 */
const norm = e => String(e || '').trim().toLowerCase();

export const ADMIN_EMAIL = norm(process.env.ADMIN_EMAIL) || 'manish18156@iiitd.ac.in';

export const isAdminEmail = email => norm(email) === ADMIN_EMAIL;
