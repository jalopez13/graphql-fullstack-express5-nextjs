import { redis } from './redis';

const MAX_EMAIL_ATTEMPTS = 5;
const EMAIL_WINDOW_SECONDS = 15 * 60; // 15 minutes

const MAX_IP_ATTEMPTS = 20;
const IP_WINDOW_SECONDS = 15 * 60; // 15 minutes

function emailKey(email: string): string {
  return `login_throttle:email:${email}`;
}

function ipKey(ip: string): string {
  return `login_throttle:ip:${ip}`;
}

/** Throws if the per-email or per-IP attempt limit has been exceeded. */
export async function checkLoginThrottle(
  email: string,
  ip: string,
): Promise<void> {
  const [emailAttempts, ipAttempts] = await Promise.all([
    redis.get(emailKey(email)),
    redis.get(ipKey(ip)),
  ]);

  if (emailAttempts !== null && Number(emailAttempts) >= MAX_EMAIL_ATTEMPTS) {
    const ttl = await redis.ttl(emailKey(email));
    throw new Error(
      `Too many login attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
    );
  }

  if (ipAttempts !== null && Number(ipAttempts) >= MAX_IP_ATTEMPTS) {
    throw new Error(
      'Too many login attempts from this address. Try again later.',
    );
  }
}

/** Increment the failed-attempt counters for this email and IP. */
export async function recordFailedLogin(
  email: string,
  ip: string,
): Promise<void> {
  const [emailCount, ipCount] = await Promise.all([
    redis.incr(emailKey(email)),
    redis.incr(ipKey(ip)),
  ]);

  await Promise.all([
    emailCount === 1
      ? redis.expire(emailKey(email), EMAIL_WINDOW_SECONDS)
      : undefined,
    ipCount === 1
      ? redis.expire(ipKey(ip), IP_WINDOW_SECONDS)
      : undefined,
  ]);
}

/** Clear the per-email counter on successful login. */
export async function clearLoginThrottle(email: string): Promise<void> {
  await redis.del(emailKey(email));
  // IP counter is NOT cleared — it tracks all attempts from that address
}
