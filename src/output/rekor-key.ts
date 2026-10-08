/**
 * Rekor's public log key, retrieved 2026-10-06. Kept in the executable so
 * source and built CLIs use the same trust anchor regardless of cwd.
 * Provenance: fixtures/rekor/README.md. A test pins this to the PEM fixture.
 * Rotation requires an explicit reviewed update; no network key discovery.
 */
export const VENDORED_REKOR_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE2G2Y+2tabdTV5BcGiBIx0a9fAFwr
kBbmLSGtks4L3qX6yYY0zufBnhC8Ur/iy55GhWP/9A/bY2LhC30M9+RYtw==
-----END PUBLIC KEY-----
`;
