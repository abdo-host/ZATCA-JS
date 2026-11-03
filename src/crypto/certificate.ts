import { type KeyObject, X509Certificate } from 'node:crypto';

type LocalCertificateStatus =
  | 'malformed'
  | 'not-yet-valid'
  | 'expired'
  | 'ca-certificate'
  | 'key-mismatch'
  | 'local-checks-passed';

/** Checks time and key binding only. Trust, revocation and CSID status are separate. */
export function checkCertificateLocally(
  certificate: string | Uint8Array,
  expectedPublicKey: KeyObject,
  at: Date,
): LocalCertificateStatus {
  const instant = at.getTime();
  if (!Number.isFinite(instant) || expectedPublicKey.type !== 'public')
    throw new Error('Expected a valid check time and a public key');

  try {
    const leaf = new X509Certificate(certificate);
    const from = leaf.validFromDate.getTime();
    const to = leaf.validToDate.getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to)
      return 'malformed';
    if (instant < from) return 'not-yet-valid';
    if (instant > to) return 'expired';
    if (leaf.ca) return 'ca-certificate';
    if (!leaf.publicKey.equals(expectedPublicKey)) return 'key-mismatch';
    return 'local-checks-passed';
  } catch {
    return 'malformed';
  }
}
