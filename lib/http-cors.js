export function getAllowedHttpOrigins() {
  const configuredOrigins =
    process.env.API_ALLOWED_ORIGINS ||
    process.env.SOCKET_ALLOWED_ORIGINS ||
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    '';

  const origins = configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    origins.push(
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3014',
      'http://localhost:3015'
    );
  }

  return [...new Set(origins)];
}

export function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedHttpOrigins();

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}
