import { db } from '../db';
import { 
  scrapedWebsites, 
  scrapingJobs,
  type InsertScrapingJob
} from '@shared/schema';
import { eq, and, lt, gte, desc } from 'drizzle-orm';
import { webScrapingService } from './webScrapingService';

interface SchedulerStats {
  activeWebsites: number;
  pendingJobs: number;
  completedJobs: number;
  failedJobs: number;
  lastRunTime?: Date;
}

export class ScrapingScheduler {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly checkInterval = 60 * 1000; // Check every minute

  constructor() {
    console.log('🕐 [SCHEDULER] Scraping scheduler initialized');
  }

  /**
   * Iniciar el scheduler automático
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ [SCHEDULER] Scheduler is already running');
      return;
    }

    console.log('🚀 [SCHEDULER] Starting scraping scheduler');
    this.isRunning = true;
    
    // Ejecutar inmediatamente
    this.checkAndRunJobs();
    
    // Configurar intervalo
    this.intervalId = setInterval(() => {
      this.checkAndRunJobs();
    }, this.checkInterval);
  }

  /**
   * Detener el scheduler
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ [SCHEDULER] Scheduler is not running');
      return;
    }

    console.log('🛑 [SCHEDULER] Stopping scraping scheduler');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Verificar y ejecutar trabajos de scraping pendientes
   */
  private async checkAndRunJobs() {
    try {
      console.log('🔍 [SCHEDULER] Checking for pending scraping jobs...');
      
      // Obtener sitios web que necesitan scraping
      const websitesNeedingScraping = await this.getWebsitesNeedingScraping();
      
      if (websitesNeedingScraping.length === 0) {
        console.log('✅ [SCHEDULER] No websites need scraping at this time');
        return;
      }

      console.log(`📋 [SCHEDULER] Found ${websitesNeedingScraping.length} websites needing scraping`);

      // Procesar cada sitio web
      for (const website of websitesNeedingScraping) {
        await this.scheduleScrapingJob(website);
      }

    } catch (error) {
      console.error('❌ [SCHEDULER] Error checking for jobs:', error);
    }
  }

  /**
   * Obtener sitios web que necesitan scraping
   */
  private async getWebsitesNeedingScraping() {
    try {
      const now = new Date();
      
      // Obtener sitios activos que:
      // 1. Están activos
      // 2. No han sido scrapeados nunca O han pasado más tiempo del intervalo configurado
      // 3. No tienen trabajos en progreso
      const websites = await db
        .select()
        .from(scrapedWebsites)
        .where(
          and(
            eq(scrapedWebsites.isActive, true)
          )
        )
        .orderBy(scrapedWebsites.lastScrapedAt);

      const websitesNeedingScraping = [];

      for (const website of websites) {
        // Verificar si necesita scraping basado en el intervalo
        const needsScraping = await this.shouldScrapeSite(website, now);
        
        if (needsScraping) {
          // Verificar que no haya trabajos en progreso
          const runningJobs = await db
            .select()
            .from(scrapingJobs)
            .where(
              and(
                eq(scrapingJobs.websiteId, website.id),
                eq(scrapingJobs.status, 'RUNNING')
              )
            );

          if (runningJobs.length === 0) {
            websitesNeedingScraping.push(website);
          } else {
            console.log(`⏳ [SCHEDULER] Website ${website.name} has running jobs, skipping`);
          }
        }
      }

      return websitesNeedingScraping;

    } catch (error) {
      console.error('❌ [SCHEDULER] Error getting websites needing scraping:', error);
      return [];
    }
  }

  /**
   * Determinar si un sitio necesita scraping
   */
  private async shouldScrapeSite(website: any, now: Date): Promise<boolean> {
    // Si nunca ha sido scrapeado, debe ser scrapeado
    if (!website.lastScrapedAt) {
      console.log(`🆕 [SCHEDULER] Website ${website.name} has never been scraped`);
      return true;
    }

    // Calcular tiempo transcurrido desde el último scraping
    const lastScraped = new Date(website.lastScrapedAt);
    const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
    const scrapingIntervalHours = website.scrapingInterval || 24;

    if (hoursSinceLastScrape >= scrapingIntervalHours) {
      console.log(`⏰ [SCHEDULER] Website ${website.name} last scraped ${Math.round(hoursSinceLastScrape)}h ago (interval: ${scrapingIntervalHours}h)`);
      return true;
    }

    console.log(`⏱️ [SCHEDULER] Website ${website.name} was scraped ${Math.round(hoursSinceLastScrape)}h ago, skipping (interval: ${scrapingIntervalHours}h)`);
    return false;
  }

  /**
   * Programar trabajo de scraping para un sitio web
   */
  private async scheduleScrapingJob(website: any) {
    try {
      console.log(`📅 [SCHEDULER] Scheduling scraping job for: ${website.name}`);

      // Crear registro de trabajo
      const jobData: InsertScrapingJob = {
        websiteId: website.id,
        userId: website.userId,
        status: 'PENDING',
        jobType: 'INCREMENTAL',
        metadata: {
          scheduledBy: 'auto-scheduler',
          scheduledAt: new Date().toISOString()
        }
      };

      const [job] = await db.insert(scrapingJobs).values(jobData).returning();

      // Ejecutar scraping en segundo plano
      this.executeScrapingJob(job.id, website);

      console.log(`✅ [SCHEDULER] Scheduled job ${job.id} for website ${website.name}`);

    } catch (error) {
      console.error(`❌ [SCHEDULER] Error scheduling job for ${website.name}:`, error);
    }
  }

  /**
   * Ejecutar trabajo de scraping
   */
  private async executeScrapingJob(jobId: string, website: any) {
    try {
      console.log(`🚀 [SCHEDULER] Starting scraping job ${jobId} for ${website.name}`);

      // Actualizar estado a RUNNING
      await db
        .update(scrapingJobs)
        .set({
          status: 'RUNNING',
          startedAt: new Date()
        })
        .where(eq(scrapingJobs.id, jobId));

      // Ejecutar scraping
      await webScrapingService.scrapeWebsite(website.id);

      console.log(`✅ [SCHEDULER] Successfully completed job ${jobId} for ${website.name}`);

    } catch (error) {
      console.error(`❌ [SCHEDULER] Error executing job ${jobId}:`, error);

      // Marcar trabajo como fallido
      await db
        .update(scrapingJobs)
        .set({
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorDetails: {
            error: error instanceof Error ? error.stack : String(error),
            timestamp: new Date().toISOString()
          }
        })
        .where(eq(scrapingJobs.id, jobId));
    }
  }

  /**
   * Obtener estadísticas del scheduler
   */
  async getStats(): Promise<SchedulerStats> {
    try {
      const [websiteStats] = await db
        .select()
        .from(scrapedWebsites)
        .where(eq(scrapedWebsites.isActive, true));

      const activeWebsites = websiteStats ? 1 : 0; // Simplified, should count all

      // Obtener estadísticas de trabajos
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [jobStats] = await db
        .select()
        .from(scrapingJobs)
        .where(gte(scrapingJobs.createdAt, today));

      // Obtener último trabajo completado
      const [lastJob] = await db
        .select()
        .from(scrapingJobs)
        .where(eq(scrapingJobs.status, 'COMPLETED'))
        .orderBy(desc(scrapingJobs.completedAt))
        .limit(1);

      return {
        activeWebsites,
        pendingJobs: 0, // TODO: Count actual pending jobs
        completedJobs: 0, // TODO: Count actual completed jobs today
        failedJobs: 0, // TODO: Count actual failed jobs today
        lastRunTime: lastJob?.completedAt || undefined
      };

    } catch (error) {
      console.error('❌ [SCHEDULER] Error getting stats:', error);
      return {
        activeWebsites: 0,
        pendingJobs: 0,
        completedJobs: 0,
        failedJobs: 0
      };
    }
  }

  /**
   * Ejecutar scraping manual para un sitio específico
   */
  async runManualScraping(websiteId: string): Promise<string> {
    try {
      console.log(`🔧 [SCHEDULER] Running manual scraping for website: ${websiteId}`);

      // Obtener información del sitio
      const [website] = await db
        .select()
        .from(scrapedWebsites)
        .where(eq(scrapedWebsites.id, websiteId));

      if (!website) {
        throw new Error('Website not found');
      }

      // Verificar que no haya trabajos en progreso
      const runningJobs = await db
        .select()
        .from(scrapingJobs)
        .where(
          and(
            eq(scrapingJobs.websiteId, websiteId),
            eq(scrapingJobs.status, 'RUNNING')
          )
        );

      if (runningJobs.length > 0) {
        return 'Ya hay un trabajo de scraping en progreso para este sitio';
      }

      // Programar trabajo manual
      await this.scheduleScrapingJob(website);

      return 'Scraping manual iniciado correctamente';

    } catch (error) {
      console.error(`❌ [SCHEDULER] Error running manual scraping:`, error);
      throw error;
    }
  }

  /**
   * Limpiar trabajos antiguos
   */
  async cleanupOldJobs(daysOld: number = 30) {
    try {
      console.log(`🧹 [SCHEDULER] Cleaning up jobs older than ${daysOld} days`);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const deletedJobs = await db
        .delete(scrapingJobs)
        .where(
          and(
            lt(scrapingJobs.createdAt, cutoffDate),
            eq(scrapingJobs.status, 'COMPLETED')
          )
        );

      console.log(`✅ [SCHEDULER] Cleaned up old completed jobs`);

    } catch (error) {
      console.error('❌ [SCHEDULER] Error cleaning up old jobs:', error);
    }
  }

  /**
   * Verificar estado del scheduler
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      nextCheckIn: this.intervalId ? this.checkInterval : null
    };
  }
}

// Instancia singleton del scheduler
export const scrapingScheduler = new ScrapingScheduler();

// Auto-iniciar el scheduler cuando se importa
scrapingScheduler.start();

// Limpiar al cerrar la aplicación
process.on('SIGTERM', () => {
  scrapingScheduler.stop();
});

process.on('SIGINT', () => {
  scrapingScheduler.stop();
});