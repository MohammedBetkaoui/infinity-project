// Canonical form of a Join applicant's phone number, used to detect the same
// number written differently: '+213 555 01 02 03', '0555010203' and
// '00213555010203' all become '0555010203'. Non-Algerian numbers compare on
// their full digit string.
//
// The database computes the same value in
// membership_applications.phone_normalized (public.membership_phone_key(), in
// supabase/migrations/20261009120000_membership_join_security.sql), which
// carries the unique index. Both must stay identical:
// tests/join-security.test.mjs checks the SQL copy.
//
// Only ASCII 0-9 count as digits, on both sides.

export function normalizeMembershipPhone(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '')
  const local = digits.startsWith('00213')
    ? digits.slice(5)
    : digits.startsWith('213') && digits.length > 9
      ? digits.slice(3)
      : digits
  const key = local.length === 9 ? `0${local}` : local
  return key || null
}
