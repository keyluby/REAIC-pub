// Configuración para Evolution API interno
export const EVOLUTION_CONFIG = {
  // Configuración de la instancia interna
  INSTANCE_STORAGE_PATH: process.env.EVOLUTION_INSTANCES_PATH || 'instances',
  
  // Configuración de Baileys
  BAILEYS_OPTIONS: {
    printQRInTerminal: false,
    browser: ['Evolution API Internal', 'Chrome', '10.15.7'] as [string, string, string],
    generateHighQualityLinkPreview: true,
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    qrTimeout: 60000,
  },
  
  // Configuración de cache
  QR_CODE_TTL: 300, // 5 minutos
  
  // Configuración de mensajes
  MESSAGE_DELAY: 1000, // 1 segundo entre mensajes
  
  // Configuración de reintentos
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000, // 5 segundos
};