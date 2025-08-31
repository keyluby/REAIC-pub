import { Request } from 'express';

/**
 * Detects the current domain automatically for webhook URLs
 * This function is designed to be scalable and work across different environments
 */
export function detectCurrentDomain(req?: Request): string {
  // FORCE CURRENT DOMAIN - Override environment variables that may be outdated
  const CURRENT_REPLIT_DOMAIN = '20906aba-2b8e-4c98-8cf8-d16de2e66ff7-00-3lbh03xkqhcf2.pike.replit.dev';
  
  // Method 1: Use request headers (most reliable for production)
  if (req) {
    const host = req.get('host') || req.get('x-forwarded-host');
    if (host && host.includes('replit.dev')) {
      console.log('🌐 Using domain from request headers:', host);
      return host;
    }
  }

  // Method 2: Force current known working domain for Replit
  if (process.env.NODE_ENV !== 'development') {
    console.log('🌐 Using forced current Replit domain:', CURRENT_REPLIT_DOMAIN);
    return CURRENT_REPLIT_DOMAIN;
  }

  // Method 3: Try Replit deployment domain construction (backup)
  if (process.env.REPL_OWNER && process.env.REPL_SLUG) {
    const constructedDomain = `${process.env.REPL_OWNER}-${process.env.REPL_SLUG}.replit.dev`;
    console.log('🌐 Using constructed domain:', constructedDomain);
    return constructedDomain;
  }

  // Method 4: Check for other deployment environment variables
  if (process.env.VERCEL_URL) {
    return process.env.VERCEL_URL;
  }
  
  if (process.env.RAILWAY_STATIC_URL) {
    return process.env.RAILWAY_STATIC_URL;
  }

  // Fallback for local development
  console.log('🌐 Using localhost fallback');
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