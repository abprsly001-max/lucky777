"""Provably-fair commit/reveal.

  1. Server generates a 32-byte server_seed and publishes SHA256(server_seed).
  2. Player supplies a client_seed (changeable at will).
  3. Each bet consumes an incrementing nonce.
  4. outcome = HMAC_SHA256(key=server_seed, msg="client_seed:nonce")
  5. On rotation the old server_seed is revealed; the player hashes it, checks
     it against the commitment they were shown, and can recompute every round.

Uses `secrets`, never `random` -- Python's Mersenne Twister is fully
predictable from 624 consecutive outputs.
"""
import hashlib
import hmac
import secrets


def new_server_seed() -> tuple[str, str]:
    seed = secrets.token_hex(32)
    return seed, sha256_hex(seed)


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def new_client_seed() -> str:
    return secrets.token_hex(8)


def digest_for(server_seed: str, client_seed: str, nonce: int, cursor: int = 0) -> bytes:
    msg = f"{client_seed}:{nonce}" if cursor == 0 else f"{client_seed}:{nonce}:{cursor}"
    return hmac.new(server_seed.encode(), msg.encode(), hashlib.sha256).digest()


def floats(server_seed: str, client_seed: str, nonce: int, count: int) -> list[float]:
    """Uniform floats in [0,1), consuming the HMAC stream 4 bytes at a time.

    One SHA-256 digest yields 8 floats; we re-hash with an incrementing cursor
    for more. This is the same construction Stake-style provably-fair uses.
    """
    out: list[float] = []
    cursor = 0
    while len(out) < count:
        d = digest_for(server_seed, client_seed, nonce, cursor)
        for i in range(8):
            out.append(int.from_bytes(d[i * 4 : (i + 1) * 4], "big") / 2**32)
        cursor += 1
    return out[:count]
