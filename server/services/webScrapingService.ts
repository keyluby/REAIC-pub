import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import crypto from 'crypto';
import { URL } from 'url';
import { db } from '../db';
import { 
  scrapedWebsites, 
  scrapedProperties, 
  propertyImages, 
  scrapingJobs,
  type InsertScrapedWebsite,
  type InsertScrapedProperty,
  type InsertPropertyImage,
  type InsertScrapingJob
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

interface PropertyData {
  title: string;
  description?: string;
  price?: number;
  currency?: string;
  priceText?: string;
  propertyType?: string;
  listingType?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  areaUnit?: string;
  location?: string;
  city?: string;
  sector?: string;
  sourceUrl: string;
  images: string[];
}

interface ScrapingPatterns {
  propertyUrlPattern: string;
  titleSelector: string;
  priceSelector: string;
  imageSelector: string;
  locationSelector: string;
  descriptionSelector: string;
}

export class WebScrapingService {
  private browser: Browser | null = null;

  constructor() {
    this.initializeBrowser();
  }

  private async initializeBrowser() {
    try {
      // Intentar inicializar Puppeteer, pero no es crítico si falla
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });
      console.log('🌐 [SCRAPING] Browser initialized successfully');
    } catch (error) {
      console.log('⚠️ [SCRAPING] Browser initialization failed, using HTTP mode:', error.message);
      this.browser = null;
    }
  }

  /**
   * Analizar un sitio web principal y detectar enlaces de propiedades automáticamente
   */
  async analyzeSite(
    userId: string, 
    mainUrl: string, 
    siteName: string, 
    description?: string
  ): Promise<{
    websiteId: string;
    patterns: ScrapingPatterns;
    sampleProperties: string[];
    estimatedTotal: number;
  }> {
    try {
      console.log(`🔍 [SCRAPING] Analyzing site: ${mainUrl}`);
      
      // Usar HTTP + Cheerio como método principal (más confiable)
      const response = await axios.get(mainUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        timeout: 15000,
        maxRedirects: 5
      });
      
      const $ = cheerio.load(response.data);
      
      // Detectar enlaces de propiedades automáticamente
      const propertyLinks = await this.detectPropertyLinks($, mainUrl);
      
      // Detectar patrones de selectores CSS
      const patterns = await this.detectPatterns($, mainUrl, propertyLinks.slice(0, 3));
      
      // Crear registro del sitio web en la base de datos
      const websiteData: InsertScrapedWebsite = {
        userId,
        url: mainUrl,
        name: siteName,
        description,
        propertyUrlPattern: patterns.propertyUrlPattern,
        titleSelector: patterns.titleSelector,
        priceSelector: patterns.priceSelector,
        imageSelector: patterns.imageSelector,
        locationSelector: patterns.locationSelector,
        descriptionSelector: patterns.descriptionSelector,
        totalPropertiesFound: propertyLinks.length,
        isActive: true,
        scrapingInterval: 24 // 24 horas por defecto
      };

      const [website] = await db.insert(scrapedWebsites).values(websiteData).returning();
      
      console.log(`✅ [SCRAPING] Site analyzed: Found ${propertyLinks.length} property links`);
      
      return {
        websiteId: website.id,
        patterns,
        sampleProperties: propertyLinks.slice(0, 10),
        estimatedTotal: propertyLinks.length
      };
      
    } catch (error) {
      console.error('❌ [SCRAPING] Error analyzing site:', error);
      throw new Error(`Failed to analyze site: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detectar enlaces de propiedades en una página
   */
  private async detectPropertyLinks($: cheerio.CheerioAPI, baseUrl: string): Promise<string[]> {
    const links = new Set<string>();
    const baseHost = new URL(baseUrl).hostname;
    
    // Patrones comunes para enlaces de propiedades
    const propertyPatterns = [
      /\/propiedad\//i,
      /\/property\//i,
      /\/inmueble\//i,
      /\/listing\//i,
      /\/casa\//i,
      /\/apartamento\//i,
      /\/apartment\//i,
      /\/house\//i,
      /\/villa\//i,
      /\/penthouse\//i,
      /\/lote\//i,
      /\/lot\//i,
      /\/rent\//i,
      /\/sale\//i,
      /\/venta\//i,
      /\/alquiler\//i,
      /\/details\//i,
      /\/detalles\//i,
      /\/view\//i,
      /\/ver\//i
    ];

    // Buscar enlaces que coincidan con patrones
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;

      let fullUrl: string;
      try {
        if (href.startsWith('http')) {
          fullUrl = href;
        } else if (href.startsWith('/')) {
          fullUrl = new URL(href, baseUrl).toString();
        } else {
          fullUrl = new URL(href, baseUrl).toString();
        }

        // Verificar que el enlace sea del mismo dominio
        const linkHost = new URL(fullUrl).hostname;
        if (linkHost !== baseHost) return;

        // Verificar patrones de propiedades
        const matchesPattern = propertyPatterns.some(pattern => pattern.test(fullUrl));
        if (matchesPattern) {
          links.add(fullUrl);
        }
      } catch (error) {
        // Ignorar URLs malformadas
      }
    });

    // También buscar por textos de enlaces comunes
    const propertyTexts = [
      'ver propiedad', 'view property', 'más información', 'more info',
      'detalles', 'details', 'ver más', 'see more', 'conocer más'
    ];

    $('a').each((_, element) => {
      const text = $(element).text().toLowerCase().trim();
      const href = $(element).attr('href');
      
      if (!href) return;

      const matchesText = propertyTexts.some(pattern => text.includes(pattern));
      if (matchesText) {
        try {
          let fullUrl: string;
          if (href.startsWith('http')) {
            fullUrl = href;
          } else {
            fullUrl = new URL(href, baseUrl).toString();
          }
          
          const linkHost = new URL(fullUrl).hostname;
          if (linkHost === baseHost) {
            links.add(fullUrl);
          }
        } catch (error) {
          // Ignorar URLs malformadas
        }
      }
    });

    return Array.from(links);
  }

  /**
   * Detectar patrones de selectores CSS automáticamente
   */
  private async detectPatterns(
    $: cheerio.CheerioAPI, 
    baseUrl: string, 
    sampleUrls: string[]
  ): Promise<ScrapingPatterns> {
    const patterns: ScrapingPatterns = {
      propertyUrlPattern: '',
      titleSelector: '',
      priceSelector: '',
      imageSelector: '',
      locationSelector: '',
      descriptionSelector: ''
    };

    // Generar patrón de URL basado en las URLs de muestra
    if (sampleUrls.length > 0) {
      const firstUrl = sampleUrls[0];
      const urlParts = firstUrl.split('/');
      const baseUrlParts = baseUrl.split('/');
      
      // Encontrar la parte común y crear patrón
      for (let i = 0; i < urlParts.length; i++) {
        if (i >= baseUrlParts.length || urlParts[i] !== baseUrlParts[i]) {
          patterns.propertyUrlPattern = urlParts.slice(0, i + 1).join('/') + '/*';
          break;
        }
      }
    }

    // Si tenemos URLs de muestra, analizarlas para detectar selectores
    if (sampleUrls.length > 0 && this.browser) {
      try {
        const sampleUrl = sampleUrls[0];
        const page = await this.browser.newPage();
        await page.goto(sampleUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        const content = await page.content();
        const $sample = cheerio.load(content);
        
        // Detectar selector de título
        patterns.titleSelector = this.detectTitleSelector($sample);
        
        // Detectar selector de precio
        patterns.priceSelector = this.detectPriceSelector($sample);
        
        // Detectar selector de imágenes
        patterns.imageSelector = this.detectImageSelector($sample);
        
        // Detectar selector de ubicación
        patterns.locationSelector = this.detectLocationSelector($sample);
        
        // Detectar selector de descripción
        patterns.descriptionSelector = this.detectDescriptionSelector($sample);
        
        await page.close();
      } catch (error) {
        console.error('❌ [SCRAPING] Error analyzing sample property:', error);
      }
    }

    return patterns;
  }

  private detectTitleSelector($: cheerio.CheerioAPI): string {
    const selectors = [
      'h1', 'h2', '.title', '.property-title', '.listing-title',
      '[class*="title"]', '[class*="heading"]', 'title', '.name',
      '.property-name', '[class*="name"]'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length > 0 && element.text().trim().length > 10) {
        return selector;
      }
    }

    return 'h1, h2, .title';
  }

  private detectPriceSelector($: cheerio.CheerioAPI): string {
    const selectors = [
      '.price', '.precio', '[class*="price"]', '[class*="precio"]',
      '.cost', '.costo', '[class*="cost"]', '[class*="valor"]',
      '.amount', '.monto', '[class*="amount"]'
    ];

    // Buscar elementos que contengan símbolos de moneda
    const currencySymbols = ['$', '€', '£', '¥', 'RD$', 'USD', 'EUR'];
    
    for (const selector of selectors) {
      const elements = $(selector);
      for (let i = 0; i < elements.length; i++) {
        const text = $(elements[i]).text();
        if (currencySymbols.some(symbol => text.includes(symbol))) {
          return selector;
        }
      }
    }

    // Buscar cualquier elemento con texto que contenga símbolos de moneda
    $('*').each((_, element) => {
      const text = $(element).text();
      if (currencySymbols.some(symbol => text.includes(symbol)) && text.length < 100) {
        const className = $(element).attr('class');
        if (className) {
          return `.${className.split(' ')[0]}`;
        }
        return $(element).prop('tagName')?.toLowerCase() || 'div';
      }
    });

    return '.price, .precio, [class*="price"]';
  }

  private detectImageSelector($: cheerio.CheerioAPI): string {
    const selectors = [
      '.gallery img', '.property-images img', '.listing-images img',
      '.slider img', '.carousel img', '.photos img', 
      '[class*="gallery"] img', '[class*="image"] img',
      '[class*="photo"] img', '.main-image', '.featured-image'
    ];

    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        return selector;
      }
    }

    return 'img';
  }

  private detectLocationSelector($: cheerio.CheerioAPI): string {
    const selectors = [
      '.location', '.ubicacion', '.address', '.direccion',
      '[class*="location"]', '[class*="address"]', '[class*="ubicacion"]',
      '.area', '.zone', '.zona', '.sector', '.city', '.ciudad'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length > 0 && element.text().trim().length > 5) {
        return selector;
      }
    }

    return '.location, .address, [class*="location"]';
  }

  private detectDescriptionSelector($: cheerio.CheerioAPI): string {
    const selectors = [
      '.description', '.descripcion', '.details', '.detalles',
      '[class*="description"]', '[class*="detail"]', '.content',
      '.property-description', '.listing-description', 'p'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      const text = element.text().trim();
      if (element.length > 0 && text.length > 50) {
        return selector;
      }
    }

    return '.description, .content, p';
  }

  /**
   * Ejecutar scraping completo de un sitio web
   */
  async scrapeWebsite(websiteId: string): Promise<void> {
    try {
      console.log(`🚀 [SCRAPING] Starting full scrape for website: ${websiteId}`);
      
      // Obtener configuración del sitio web
      const [website] = await db
        .select()
        .from(scrapedWebsites)
        .where(eq(scrapedWebsites.id, websiteId));

      if (!website) {
        throw new Error('Website not found');
      }

      // Crear trabajo de scraping
      const jobData: InsertScrapingJob = {
        websiteId,
        userId: website.userId,
        status: 'RUNNING',
        jobType: 'FULL_SCRAPE',
        startedAt: new Date()
      };

      const [job] = await db.insert(scrapingJobs).values(jobData).returning();

      try {
        // Detectar enlaces de propiedades
        const propertyUrls = await this.getPropertyUrls(website.url);
        
        // Actualizar job con total encontrado
        await db
          .update(scrapingJobs)
          .set({ 
            propertiesFound: propertyUrls.length,
            pagesScraped: 1
          })
          .where(eq(scrapingJobs.id, job.id));

        let propertiesAdded = 0;
        let propertiesUpdated = 0;

        // Procesar cada propiedad
        for (const url of propertyUrls.slice(0, website.maxPages || 100)) {
          try {
            const property = await this.scrapeProperty(url, website);
            
            if (property) {
              const result = await this.saveProperty(property, website.userId);
              if (result.isNew) {
                propertiesAdded++;
              } else {
                propertiesUpdated++;
              }
            }
          } catch (error) {
            console.error(`❌ [SCRAPING] Error scraping property ${url}:`, error);
          }
        }

        // Marcar trabajo como completado
        await db
          .update(scrapingJobs)
          .set({
            status: 'COMPLETED',
            completedAt: new Date(),
            propertiesAdded,
            propertiesUpdated
          })
          .where(eq(scrapingJobs.id, job.id));

        // Actualizar sitio web
        await db
          .update(scrapedWebsites)
          .set({
            lastScrapedAt: new Date(),
            totalPropertiesFound: propertiesAdded + propertiesUpdated
          })
          .where(eq(scrapedWebsites.id, websiteId));

        console.log(`✅ [SCRAPING] Completed scraping: ${propertiesAdded} added, ${propertiesUpdated} updated`);

      } catch (error) {
        // Marcar trabajo como fallido
        await db
          .update(scrapingJobs)
          .set({
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          })
          .where(eq(scrapingJobs.id, job.id));

        throw error;
      }

    } catch (error) {
      console.error('❌ [SCRAPING] Error in scrapeWebsite:', error);
      throw error;
    }
  }

  /**
   * Obtener URLs de propiedades de un sitio usando HTTP
   */
  private async getPropertyUrls(baseUrl: string): Promise<string[]> {
    try {
      console.log(`🔍 [SCRAPING] Getting property URLs from: ${baseUrl}`);
      
      const response = await axios.get(baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      const propertyLinks = await this.detectPropertyLinks($, baseUrl);
      
      console.log(`✅ [SCRAPING] Found ${propertyLinks.length} property URLs`);
      return propertyLinks;
    } catch (error) {
      console.error(`❌ [SCRAPING] Error getting property URLs:`, error);
      return [];
    }
  }

  /**
   * Extraer datos de una propiedad específica usando HTTP
   */
  private async scrapeProperty(url: string, website: any): Promise<PropertyData | null> {
    try {
      console.log(`🏠 [SCRAPING] Scraping property: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      
      // Extraer datos usando los selectores detectados
      const title = this.extractText($, website.titleSelector) || 'Título no disponible';
      const description = this.extractText($, website.descriptionSelector);
      const priceText = this.extractText($, website.priceSelector);
      const location = this.extractText($, website.locationSelector);
      
      // Extraer imágenes
      const images = this.extractImages($, website.imageSelector, url);
      
      // Procesar precio
      const { price, currency } = this.parsePrice(priceText);
      
      // Detectar tipo de propiedad y operación
      const { propertyType, listingType } = this.detectPropertyType(title, description || '');
      
      // Detectar características
      const { bedrooms, bathrooms, area, areaUnit } = this.extractFeatures(title, description || '');
      
      // Procesar ubicación
      const { city, sector } = this.parseLocation(location);
      
      console.log(`✅ [SCRAPING] Successfully scraped property: ${title}`);

      return {
        title,
        description,
        price,
        currency,
        priceText,
        propertyType,
        listingType,
        bedrooms,
        bathrooms,
        area,
        areaUnit,
        location,
        city,
        sector,
        sourceUrl: url,
        images: images.slice(0, 10) // Limitar a 10 imágenes
      };

    } catch (error) {
      console.error(`❌ [SCRAPING] Error scraping property ${url}:`, error);
      return null;
    }
  }

  private extractText($: cheerio.CheerioAPI, selector: string): string {
    if (!selector) return '';
    
    const selectors = selector.split(',').map(s => s.trim());
    
    for (const sel of selectors) {
      const element = $(sel).first();
      if (element.length > 0) {
        return element.text().trim();
      }
    }
    
    return '';
  }

  private extractImages($: cheerio.CheerioAPI, selector: string, baseUrl: string): string[] {
    const images: string[] = [];
    
    if (!selector) {
      selector = 'img';
    }
    
    $(selector).each((_, element) => {
      const src = $(element).attr('src') || $(element).attr('data-src');
      if (src) {
        try {
          let fullUrl: string;
          if (src.startsWith('http')) {
            fullUrl = src;
          } else {
            fullUrl = new URL(src, baseUrl).toString();
          }
          images.push(fullUrl);
        } catch (error) {
          // Ignorar URLs malformadas
        }
      }
    });

    return Array.from(new Set(images)); // Eliminar duplicados
  }

  private parsePrice(priceText: string): { price?: number; currency?: string } {
    if (!priceText) return {};
    
    // Limpiar texto
    const cleanText = priceText.replace(/\s+/g, ' ').trim();
    
    // Detectar moneda
    let currency = 'RD$';
    if (cleanText.includes('USD') || cleanText.includes('$')) {
      currency = 'USD';
    } else if (cleanText.includes('EUR') || cleanText.includes('€')) {
      currency = 'EUR';
    }
    
    // Extraer número
    const numberMatch = cleanText.match(/[\d,]+\.?\d*/);
    if (numberMatch) {
      const numberStr = numberMatch[0].replace(/,/g, '');
      const price = parseFloat(numberStr);
      if (!isNaN(price)) {
        return { price, currency };
      }
    }
    
    return { currency };
  }

  private detectPropertyType(title: string, description: string): { propertyType?: string; listingType?: string } {
    const text = (title + ' ' + description).toLowerCase();
    
    let propertyType: string = 'property';
    let listingType: string = 'sale';
    
    // Detectar tipo de propiedad
    if (text.includes('apartament') || text.includes('apart')) {
      propertyType = 'apartment';
    } else if (text.includes('casa') || text.includes('house')) {
      propertyType = 'house';
    } else if (text.includes('villa')) {
      propertyType = 'villa';
    } else if (text.includes('penthouse')) {
      propertyType = 'penthouse';
    } else if (text.includes('lote') || text.includes('terreno')) {
      propertyType = 'lot';
    }
    
    // Detectar tipo de operación
    if (text.includes('alquiler') || text.includes('rent') || text.includes('alqui')) {
      listingType = 'rent';
    }
    
    return { propertyType, listingType };
  }

  private extractFeatures(title: string, description: string): {
    bedrooms?: number;
    bathrooms?: number;
    area?: number;
    areaUnit?: string;
  } {
    const text = (title + ' ' + description).toLowerCase();
    
    // Extraer habitaciones
    const bedroomsMatch = text.match(/(\d+)\s*(hab|habitac|bedroom|recámar|dormitor)/);
    const bedrooms = bedroomsMatch ? parseInt(bedroomsMatch[1]) : undefined;
    
    // Extraer baños
    const bathroomsMatch = text.match(/(\d+)\s*(baño|bathroom|bath)/);
    const bathrooms = bathroomsMatch ? parseInt(bathroomsMatch[1]) : undefined;
    
    // Extraer área
    const areaMatch = text.match(/(\d+(?:\.\d+)?)\s*(m2|m²|mt2|metros|mts)/);
    const area = areaMatch ? parseFloat(areaMatch[1]) : undefined;
    const areaUnit = areaMatch ? 'm2' : undefined;
    
    return { bedrooms, bathrooms, area, areaUnit };
  }

  private parseLocation(locationText: string): { city?: string; sector?: string } {
    if (!locationText) return {};
    
    const parts = locationText.split(',').map(p => p.trim());
    
    // Ciudades conocidas de República Dominicana
    const knownCities = [
      'santo domingo', 'santiago', 'la romana', 'puerto plata', 'san cristóbal',
      'la vega', 'moca', 'baní', 'azua', 'mao', 'higüey', 'cotuí', 'bonao'
    ];
    
    let city: string | undefined;
    let sector: string | undefined;
    
    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      if (knownCities.some(c => lowerPart.includes(c))) {
        city = part;
      } else if (!sector) {
        sector = part;
      }
    }
    
    if (!city && parts.length > 0) {
      city = parts[parts.length - 1]; // Último elemento como ciudad
    }
    
    if (!sector && parts.length > 1) {
      sector = parts[0]; // Primer elemento como sector
    }
    
    return { city, sector };
  }

  /**
   * Guardar propiedad en la base de datos
   */
  private async saveProperty(property: PropertyData, userId: string): Promise<{ isNew: boolean; propertyId: string }> {
    try {
      // Crear hash único para la URL
      const urlHash = crypto.createHash('md5').update(property.sourceUrl).digest('hex');
      
      // Verificar si ya existe
      const existing = await db
        .select()
        .from(scrapedProperties)
        .where(eq(scrapedProperties.urlHash, urlHash));

      const propertyData: InsertScrapedProperty = {
        userId,
        websiteId: '', // Se actualizará en la llamada
        sourceUrl: property.sourceUrl,
        urlHash,
        title: property.title,
        description: property.description,
        price: property.price,
        currency: property.currency,
        priceText: property.priceText,
        propertyType: property.propertyType,
        listingType: property.listingType,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        area: property.area,
        areaUnit: property.areaUnit,
        location: property.location,
        city: property.city,
        sector: property.sector,
        imageCount: property.images.length,
        lastUpdatedAt: new Date()
      };

      let propertyId: string;
      let isNew = false;

      if (existing.length > 0) {
        // Actualizar existente
        await db
          .update(scrapedProperties)
          .set(propertyData)
          .where(eq(scrapedProperties.id, existing[0].id));
        
        propertyId = existing[0].id;
        
        // Eliminar imágenes existentes
        await db
          .delete(propertyImages)
          .where(eq(propertyImages.propertyId, propertyId));
      } else {
        // Crear nueva
        const [newProperty] = await db
          .insert(scrapedProperties)
          .values(propertyData)
          .returning();
        
        propertyId = newProperty.id;
        isNew = true;
      }

      // Guardar imágenes
      if (property.images.length > 0) {
        const imageData: InsertPropertyImage[] = property.images.map((url, index) => ({
          propertyId,
          originalUrl: url,
          imageUrl: url,
          isFeatured: index === 0,
          sortOrder: index
        }));

        await db.insert(propertyImages).values(imageData);
      }

      return { isNew, propertyId };

    } catch (error) {
      console.error('❌ [SCRAPING] Error saving property:', error);
      throw error;
    }
  }

  /**
   * Obtener sitios web configurados para un usuario
   */
  async getUserWebsites(userId: string) {
    return await db
      .select()
      .from(scrapedWebsites)
      .where(eq(scrapedWebsites.userId, userId))
      .orderBy(desc(scrapedWebsites.createdAt));
  }

  /**
   * Obtener propiedades extraídas
   */
  async getScrapedProperties(userId: string, websiteId?: string) {
    const query = db
      .select()
      .from(scrapedProperties)
      .where(eq(scrapedProperties.userId, userId));
    
    if (websiteId) {
      return await db
        .select()
        .from(scrapedProperties)
        .where(and(
          eq(scrapedProperties.userId, userId),
          eq(scrapedProperties.websiteId, websiteId)
        ))
        .orderBy(desc(scrapedProperties.createdAt));
    }
    
    return await query.orderBy(desc(scrapedProperties.createdAt));
  }

  /**
   * Búsqueda inteligente de propiedades
   */
  async searchProperties(userId: string, query: string, filters: any = {}) {
    // TODO: Implementar búsqueda inteligente similar a AlterEstate
    // Por ahora retornamos todas las propiedades del usuario
    return await this.getScrapedProperties(userId);
  }

  /**
   * Descubrir URLs de propiedades para selección manual
   */
  async discoverPropertyUrls(websiteId: string): Promise<{
    success: boolean;
    urls: Array<{
      url: string;
      title: string;
      preview?: string;
    }>;
    website: any;
  }> {
    try {
      console.log(`🔍 [SCRAPING] Discovering property URLs for website: ${websiteId}`);
      
      // Obtener configuración del sitio web
      const [website] = await db
        .select()
        .from(scrapedWebsites)
        .where(eq(scrapedWebsites.id, websiteId));
      
      if (!website) {
        throw new Error('Website not found');
      }
      
      // Obtener URLs de propiedades
      const propertyUrls = await this.getPropertyUrls(website.url);
      
      // Obtener previews de las primeras URLs
      const urlsWithPreviews = await Promise.all(
        propertyUrls.slice(0, 20).map(async (url) => {
          try {
            const response = await axios.get(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              timeout: 10000
            });
            
            const $ = cheerio.load(response.data);
            const title = this.extractText($, website.titleSelector) || 
                         $('title').text() || 
                         $('h1').first().text() || 
                         'Título no disponible';
            
            const preview = this.extractText($, website.descriptionSelector) ||
                           $('meta[name="description"]').attr('content') ||
                           $('p').first().text() ||
                           '';
            
            return {
              url,
              title: title.trim().substring(0, 100),
              preview: preview.trim().substring(0, 150)
            };
          } catch (error) {
            return {
              url,
              title: 'Error al cargar título',
              preview: 'No se pudo obtener vista previa'
            };
          }
        })
      );
      
      console.log(`✅ [SCRAPING] Discovered ${urlsWithPreviews.length} property URLs with previews`);
      
      return {
        success: true,
        urls: urlsWithPreviews,
        website
      };
      
    } catch (error) {
      console.error('❌ [SCRAPING] Error discovering property URLs:', error);
      throw error;
    }
  }

  /**
   * Scrapear propiedades seleccionadas manualmente
   */
  async scrapeSelectedProperties(websiteId: string, selectedUrls: string[]): Promise<void> {
    try {
      console.log(`🚀 [SCRAPING] Starting selective scraping for ${selectedUrls.length} URLs`);
      
      // Obtener configuración del sitio web
      const [website] = await db
        .select()
        .from(scrapedWebsites)
        .where(eq(scrapedWebsites.id, websiteId));
      
      if (!website) {
        throw new Error('Website not found');
      }
      
      let successCount = 0;
      let errorCount = 0;
      
      // Procesar cada URL seleccionada
      for (const url of selectedUrls) {
        try {
          console.log(`🏠 [SCRAPING] Processing selected URL: ${url}`);
          
          const propertyData = await this.scrapeProperty(url, website);
          
          if (propertyData) {
            const saved = await this.savePropertyData(propertyData, websiteId, website.userId);
            if (saved) {
              successCount++;
              console.log(`✅ [SCRAPING] Successfully saved property from: ${url}`);
            }
          } else {
            errorCount++;
            console.log(`❌ [SCRAPING] Failed to extract data from: ${url}`);
          }
          
          // Pausa entre peticiones
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (urlError) {
          errorCount++;
          console.error(`❌ [SCRAPING] Error processing URL ${url}:`, urlError);
        }
      }
      
      // Actualizar timestamp del sitio web
      await db
        .update(scrapedWebsites)
        .set({ 
          lastScrapedAt: new Date(),
          totalPropertiesFound: successCount
        })
        .where(eq(scrapedWebsites.id, websiteId));
      
      console.log(`✅ [SCRAPING] Selective scraping completed: ${successCount} success, ${errorCount} errors`);
      
    } catch (error) {
      console.error('❌ [SCRAPING] Error in selective scraping:', error);
      throw error;
    }
  }

  /**
   * Cleanup - cerrar browser
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const webScrapingService = new WebScrapingService();

// Cleanup al terminar el proceso
process.on('SIGTERM', () => {
  webScrapingService.cleanup();
});

process.on('SIGINT', () => {
  webScrapingService.cleanup();
});