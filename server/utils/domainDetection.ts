import { Request } from 'express';

/**
 * Detects the current domain automatically for webhook URLs
 * This function is designed to be scalable and work across different environments
 */
export function detectCurrentDomain(req?: Request): string {
  // Method 1: Use request headers (most reliable for production)
  if (req) {
    const host = req.get('host') || req.get('x-forwarded-host');
    if (host) {
      return host;
    }
  }

  // Method 2: Try Replit deployment domain construction
  if (process.env.REPL_OWNER && process.env.REPL_SLUG) {
    return `${process.env.REPL_OWNER}-${process.env.REPL_SLUG}.replit.dev`;
  }

  // Method 3: Use REPLIT_DOMAINS if available
  const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
  if (domains.length > 0) {
    return domains[0];
  }

  // Method 4: Check for other deployment environment variables
  if (process.env.VERCEL_URL) {
    return process.env.VERCEL_URL;
  }
  
  if (process.env.RAILWAY_STATIC_URL) {
    return process.env.RAILWAY_STATIC_URL;
  }

  // Fallback for local development
  return 'localhost:5000';
}

/**
 * Constructs webhook URL for WhatsApp instances
 * Automatically adapts to the current deployment environment
 */
export function constructWebhookUrl(instanceName: string, req?: Request): string {
  const domain = detectCurrentDomain(req);
  const protocol = domain.includes('localhost') ? 'http' : 'https';
  
  return `${protocol}://${domain}/webhook/whatsapp/${instanceName}`;
}

/**
 * Logs domain detection information for debugging
 */
export function logDomainInfo(req?: Request) {
  const detectedDomain = detectCurrentDomain(req);
  
  console.log('🌐 Domain Detection Info:');
  console.log('  - Detected Domain:', detectedDomain);
  console.log('  - REPL_OWNER:', process.env.REPL_OWNER || 'not set');
  console.log('  - REPL_SLUG:', process.env.REPL_SLUG || 'not set');
  console.log('  - REPLIT_DOMAINS:', process.env.REPLIT_DOMAINS || 'not set');
  console.log('  - NODE_ENV:', process.env.NODE_ENV || 'not set');
  
  if (req) {
    console.log('  - Request Host:', req.get('host') || 'not available');
    console.log('  - X-Forwarded-Host:', req.get('x-forwarded-host') || 'not available');
  }
}