import { db } from '../db';
import { 
  scrapedProperties, 
  propertyImages, 
  scrapedWebsites,
  type ScrapedProperty 
} from '@shared/schema';
import { eq, and, like, gte, lte, desc, sql } from 'drizzle-orm';

interface PropertyFilters {
  location?: string;
  search?: string;
  listingType?: string; // "sale" or "rent"
  propertyType?: string; // "apartment", "house", "villa", etc.
  priceMin?: number;
  priceMax?: number;
  bedroomsMin?: number;
  bedroomsMax?: number;
  bathroomsMin?: number;
  bathroomsMax?: number;
  areaMin?: number;
  areaMax?: number;
  currency?: string;
}

interface PropertyWithImages extends ScrapedProperty {
  images: Array<{
    id: string;
    imageUrl: string;
    isFeatured: boolean | null;
    altText: string | null;
  }>;
}

export class InternalPropertyService {
  /**
   * Búsqueda inteligente de propiedades basada en consulta natural
   */
  async intelligentPropertySearch(
    userId: string, 
    query: string, 
    userLocation?: string
  ): Promise<PropertyWithImages[]> {
    try {
      console.log(`🔍 [INTERNAL] Intelligent search for user ${userId}: "${query}"`);
      
      // Analizar la consulta para extraer criterios de búsqueda
      const filters = this.parseSearchQuery(query);
      
      // Si hay ubicación del usuario, agregarla
      if (userLocation && !filters.location) {
        filters.search = userLocation;
      }
      
      const properties = await this.searchProperties(userId, filters);
      
      // Limitar a las primeras 10 propiedades para respuestas eficientes
      const limitedProperties = properties.slice(0, 10);
      
      console.log(`✅ [INTERNAL] Found ${limitedProperties.length} properties matching criteria`);
      return limitedProperties;
      
    } catch (error) {
      console.error('❌ [INTERNAL] Error in intelligent search:', error);
      throw error;
    }
  }

  /**
   * Buscar propiedades con filtros específicos
   */
  async searchProperties(userId: string, filters: PropertyFilters = {}): Promise<PropertyWithImages[]> {
    try {
      console.log('🏘️ [INTERNAL] Searching properties with filters:', filters);
      
      let query = db
        .select()
        .from(scrapedProperties)
        .where(
          and(
            eq(scrapedProperties.userId, userId),
            eq(scrapedProperties.isAvailable, true)
          )
        );

      // Construir filtros dinámicamente
      const conditions = [
        eq(scrapedProperties.userId, userId),
        eq(scrapedProperties.isAvailable, true)
      ];

      // Filtro de búsqueda por texto
      if (filters.search) {
        conditions.push(
          sql`(${scrapedProperties.title} ILIKE ${'%' + filters.search + '%'} 
              OR ${scrapedProperties.description} ILIKE ${'%' + filters.search + '%'}
              OR ${scrapedProperties.location} ILIKE ${'%' + filters.search + '%'}
              OR ${scrapedProperties.city} ILIKE ${'%' + filters.search + '%'}
              OR ${scrapedProperties.sector} ILIKE ${'%' + filters.search + '%'})`
        );
      }

      // Filtro de ubicación específica
      if (filters.location) {
        conditions.push(
          sql`(${scrapedProperties.location} ILIKE ${'%' + filters.location + '%'}
              OR ${scrapedProperties.city} ILIKE ${'%' + filters.location + '%'}
              OR ${scrapedProperties.sector} ILIKE ${'%' + filters.location + '%'})`
        );
      }

      // Filtro de tipo de operación
      if (filters.listingType) {
        conditions.push(eq(scrapedProperties.listingType, filters.listingType));
      }

      // Filtro de tipo de propiedad
      if (filters.propertyType) {
        conditions.push(eq(scrapedProperties.propertyType, filters.propertyType));
      }

      // Filtros de precio (solo si las columnas no son null)
      if (filters.priceMin && filters.priceMax) {
        conditions.push(
          sql`${scrapedProperties.price} IS NOT NULL AND ${scrapedProperties.price} >= ${filters.priceMin} AND ${scrapedProperties.price} <= ${filters.priceMax}`
        );
      } else if (filters.priceMin) {
        conditions.push(
          sql`${scrapedProperties.price} IS NOT NULL AND ${scrapedProperties.price} >= ${filters.priceMin}`
        );
      } else if (filters.priceMax) {
        conditions.push(
          sql`${scrapedProperties.price} IS NOT NULL AND ${scrapedProperties.price} <= ${filters.priceMax}`
        );
      }

      // Filtros de habitaciones
      if (filters.bedroomsMin && filters.bedroomsMax) {
        conditions.push(
          sql`${scrapedProperties.bedrooms} IS NOT NULL AND ${scrapedProperties.bedrooms} >= ${filters.bedroomsMin} AND ${scrapedProperties.bedrooms} <= ${filters.bedroomsMax}`
        );
      } else if (filters.bedroomsMin) {
        conditions.push(
          sql`${scrapedProperties.bedrooms} IS NOT NULL AND ${scrapedProperties.bedrooms} >= ${filters.bedroomsMin}`
        );
      }

      // Filtros de baños
      if (filters.bathroomsMin && filters.bathroomsMax) {
        conditions.push(
          sql`${scrapedProperties.bathrooms} IS NOT NULL AND ${scrapedProperties.bathrooms} >= ${filters.bathroomsMin} AND ${scrapedProperties.bathrooms} <= ${filters.bathroomsMax}`
        );
      } else if (filters.bathroomsMin) {
        conditions.push(
          sql`${scrapedProperties.bathrooms} IS NOT NULL AND ${scrapedProperties.bathrooms} >= ${filters.bathroomsMin}`
        );
      }

      // Filtros de área
      if (filters.areaMin && filters.areaMax) {
        conditions.push(
          sql`${scrapedProperties.area} IS NOT NULL AND ${scrapedProperties.area} >= ${filters.areaMin} AND ${scrapedProperties.area} <= ${filters.areaMax}`
        );
      } else if (filters.areaMin) {
        conditions.push(
          sql`${scrapedProperties.area} IS NOT NULL AND ${scrapedProperties.area} >= ${filters.areaMin}`
        );
      }

      // Filtro de moneda
      if (filters.currency) {
        conditions.push(eq(scrapedProperties.currency, filters.currency));
      }

      // Aplicar todas las condiciones
      const properties = await db
        .select()
        .from(scrapedProperties)
        .where(and(...conditions))
        .orderBy(desc(scrapedProperties.createdAt))
        .limit(50);

      // Cargar imágenes para cada propiedad
      const propertiesWithImages: PropertyWithImages[] = await Promise.all(
        properties.map(async (property) => {
          const images = await db
            .select({
              id: propertyImages.id,
              imageUrl: propertyImages.imageUrl,
              isFeatured: propertyImages.isFeatured,
              altText: propertyImages.altText
            })
            .from(propertyImages)
            .where(eq(propertyImages.propertyId, property.id))
            .orderBy(desc(propertyImages.isFeatured), propertyImages.sortOrder);

          return {
            ...property,
            images: images || []
          };
        })
      );

      console.log(`🏘️ [INTERNAL] Found ${propertiesWithImages.length} properties`);
      return propertiesWithImages;
      
    } catch (error) {
      console.error('❌ [INTERNAL] Error searching properties:', error);
      throw new Error('Error al buscar propiedades internas');
    }
  }

  /**
   * Obtener detalles completos de una propiedad por ID
   */
  async getPropertyDetail(userId: string, propertyId: string): Promise<PropertyWithImages | null> {
    try {
      console.log(`🏠 [INTERNAL] Getting property detail for: ${propertyId}`);
      
      const [property] = await db
        .select()
        .from(scrapedProperties)
        .where(
          and(
            eq(scrapedProperties.id, propertyId),
            eq(scrapedProperties.userId, userId)
          )
        );

      if (!property) {
        return null;
      }

      // Cargar imágenes
      const images = await db
        .select({
          id: propertyImages.id,
          imageUrl: propertyImages.imageUrl,
          isFeatured: propertyImages.isFeatured,
          altText: propertyImages.altText
        })
        .from(propertyImages)
        .where(eq(propertyImages.propertyId, property.id))
        .orderBy(desc(propertyImages.isFeatured), propertyImages.sortOrder);

      console.log(`🏠 [INTERNAL] Property detail retrieved: ${property.title}`);
      
      return {
        ...property,
        images: images || []
      };
      
    } catch (error) {
      console.error(`❌ [INTERNAL] Error getting property detail:`, error);
      throw new Error('Error al obtener detalles de la propiedad');
    }
  }

  /**
   * Analizar consulta de texto natural para extraer filtros
   */
  private parseSearchQuery(query: string): PropertyFilters {
    const filters: PropertyFilters = {};
    const queryLower = query.toLowerCase();
    
    // Detectar tipo de operación
    if (queryLower.includes('alqui') || queryLower.includes('rent')) {
      filters.listingType = 'rent';
    } else if (queryLower.includes('vent') || queryLower.includes('compr')) {
      filters.listingType = 'sale';
    }
    
    // Detectar tipo de propiedad
    if (queryLower.includes('apartament') || queryLower.includes('apart')) {
      filters.propertyType = 'apartment';
    } else if (queryLower.includes('casa') || queryLower.includes('house')) {
      filters.propertyType = 'house';
    } else if (queryLower.includes('penthouse')) {
      filters.propertyType = 'penthouse';
    } else if (queryLower.includes('villa')) {
      filters.propertyType = 'villa';
    } else if (queryLower.includes('lote') || queryLower.includes('terreno')) {
      filters.propertyType = 'lot';
    }
    
    // Detectar número de habitaciones
    const roomsMatch = queryLower.match(/(\d+)\s*(hab|habitac|room|recámar|dormitor)/);
    if (roomsMatch) {
      filters.bedroomsMin = parseInt(roomsMatch[1]);
    }
    
    // Detectar número de baños
    const bathsMatch = queryLower.match(/(\d+)\s*(baño|bathroom|bath)/);
    if (bathsMatch) {
      filters.bathroomsMin = parseInt(bathsMatch[1]);
    }
    
    // Detectar rango de precio
    const priceMatch = queryLower.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(usd|dollar|peso)/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(/,/g, ''));
      filters.currency = priceMatch[2].includes('usd') || priceMatch[2].includes('dollar') ? 'USD' : 'RD$';
      
      // Si es menor a 200k, asumimos es el máximo
      if (price < 200000) {
        filters.priceMax = price;
      } else {
        filters.priceMin = price;
      }
    }
    
    // Detectar ubicaciones específicas
    const dominicanLocations = [
      'santo domingo', 'santiago', 'punta cana', 'puerto plata', 'la romana',
      'bella vista', 'naco', 'piantini', 'gazcue', 'zona colonial', 'los prados',
      'evaristo morales', 'la esperilla', 'serralles', 'mirador sur', 'la julia',
      'nuevas terrazas', 'arroyo hondo', 'costa del sol', 'juan dolio'
    ];
    
    dominicanLocations.forEach(location => {
      if (queryLower.includes(location)) {
        filters.location = location;
      }
    });
    
    console.log('🔍 [INTERNAL] Parsed filters:', filters);
    return filters;
  }

  /**
   * Formatear propiedades para respuesta de IA
   */
  formatPropertiesForAI(properties: PropertyWithImages[]): string {
    if (properties.length === 0) {
      return 'No encontré propiedades que coincidan con tus criterios en nuestra base de datos. ¿Te gustaría ajustar tu búsqueda o que configure nuevos sitios web para extraer más propiedades?';
    }
    
    const formatted = properties.map((property, index) => {
      // Formatear precio
      let formattedPrice = 'Precio a consultar';
      if (property.price && typeof property.price === 'number') {
        const price = new Intl.NumberFormat('es-DO', {
          style: 'currency',
          currency: property.currency || 'USD'
        }).format(property.price);
        formattedPrice = price;
      } else if (property.priceText) {
        formattedPrice = property.priceText;
      }
      
      // Formatear características
      const rooms = property.bedrooms ? `${property.bedrooms} hab` : '';
      const baths = property.bathrooms ? `${property.bathrooms} baños` : '';
      const area = property.area ? `${property.area}${property.areaUnit || 'm²'}` : '';
      const details = [rooms, baths, area].filter(Boolean).join(', ');
      
      // Emoji por tipo de propiedad
      const propertyEmoji = this.getPropertyEmoji(property.propertyType);
      
      return `${index + 1}. **${property.title}** ${propertyEmoji}
   - **Precio**: ${formattedPrice}
   - **Ubicación**: ${property.sector ? `${property.sector}, ` : ''}${property.city || 'Ubicación no especificada'}
   ${details ? `- **Características**: ${details}` : ''}
   ${property.description ? `- **Descripción**: ${property.description.substring(0, 100)}${property.description.length > 100 ? '...' : ''}` : ''}
   - **Ver más**: ${property.sourceUrl}
   - **ID**: ${property.id}`;
    }).join('\n\n');
    
    return formatted + '\n\n¿Te interesa alguna de estas propiedades? Puedo enviarte más detalles, fotos o ayudarte a programar una visita.';
  }

  /**
   * Obtener emoji según tipo de propiedad
   */
  private getPropertyEmoji(propertyType?: string): string {
    const emojiMap: { [key: string]: string } = {
      'apartment': '🏢',
      'house': '🏠',
      'villa': '🏡',
      'penthouse': '🏙️',
      'lot': '🗾',
      'commercial': '🏬',
      'office': '🏢',
      'warehouse': '🏭'
    };
    
    return emojiMap[propertyType || ''] || '🏠';
  }

  /**
   * Formatear propiedades para carrusel interactivo de WhatsApp
   */
  formatPropertiesForCarousel(properties: PropertyWithImages[]): Array<{
    imageUrl: string;
    title: string;
    price: string;
    description: string;
    propertyUrl: string;
    uid: string;
    id: string;
  }> {
    return properties.map(property => {
      // Formatear precio
      let formattedPrice = 'Precio a consultar';
      if (property.price && typeof property.price === 'number') {
        const currency = property.currency || 'RD$';
        formattedPrice = `${currency} ${property.price.toLocaleString()}`;
      } else if (property.priceText) {
        formattedPrice = property.priceText;
      }

      // Obtener imagen principal
      const featuredImage = property.images.find(img => img.isFeatured) || property.images[0];
      const imageUrl = featuredImage?.imageUrl || 'https://via.placeholder.com/400x300?text=Sin+Imagen';

      // Formatear descripción corta
      const rooms = property.bedrooms || 0;
      const bathrooms = property.bathrooms || 0;
      const location = property.sector || property.city || 'Ubicación no especificada';
      const description = `${rooms} hab • ${bathrooms} baños\n${location}`;

      return {
        imageUrl,
        title: property.title || 'Propiedad sin nombre',
        price: formattedPrice,
        description,
        propertyUrl: property.sourceUrl,
        uid: property.id, // Usar el ID interno como uid
        id: property.id
      };
    });
  }

  /**
   * Obtener galería de fotos de una propiedad específica
   */
  async getPropertyMedia(userId: string, propertyId: string): Promise<{
    images: string[];
    videos: string[];
    featuredImage?: string;
    virtualTour?: string;
  }> {
    try {
      console.log(`📸 [INTERNAL] Getting media for property: ${propertyId}`);
      
      const property = await this.getPropertyDetail(userId, propertyId);
      
      if (!property) {
        throw new Error('Property not found');
      }
      
      const images = property.images.map(img => img.imageUrl);
      const featuredImage = property.images.find(img => img.isFeatured)?.imageUrl || undefined;
      
      const media = {
        images: images || [],
        videos: [], // TODO: Implementar soporte para videos
        featuredImage,
        virtualTour: undefined // TODO: Implementar soporte para tours virtuales
      };
      
      console.log(`📸 [INTERNAL] Found ${media.images.length} images for property ${propertyId}`);
      if (media.featuredImage) console.log(`🌟 [INTERNAL] Featured image available`);
      
      return media;
      
    } catch (error) {
      console.error(`❌ [INTERNAL] Error getting property media:`, error);
      throw new Error('Error al obtener medios de la propiedad');
    }
  }

  /**
   * Validar si el sistema de scraping está configurado para un usuario
   */
  async isScrapingEnabled(userId: string): Promise<boolean> {
    try {
      const websites = await db
        .select()
        .from(scrapedWebsites)
        .where(
          and(
            eq(scrapedWebsites.userId, userId),
            eq(scrapedWebsites.isActive, true)
          )
        )
        .limit(1);

      return websites.length > 0;
    } catch (error) {
      console.error('❌ [INTERNAL] Error checking scraping status:', error);
      return false;
    }
  }

  /**
   * Obtener estadísticas de propiedades para un usuario
   */
  async getPropertyStats(userId: string): Promise<{
    totalProperties: number;
    activeWebsites: number;
    propertiesForSale: number;
    propertiesForRent: number;
    avgPrice: number;
  }> {
    try {
      const [stats] = await db
        .select({
          totalProperties: sql<number>`count(*)`,
          propertiesForSale: sql<number>`count(*) filter (where listing_type = 'sale')`,
          propertiesForRent: sql<number>`count(*) filter (where listing_type = 'rent')`,
          avgPrice: sql<number>`avg(price) filter (where price is not null)`
        })
        .from(scrapedProperties)
        .where(
          and(
            eq(scrapedProperties.userId, userId),
            eq(scrapedProperties.isAvailable, true)
          )
        );

      const [websiteCount] = await db
        .select({
          activeWebsites: sql<number>`count(*)`
        })
        .from(scrapedWebsites)
        .where(
          and(
            eq(scrapedWebsites.userId, userId),
            eq(scrapedWebsites.isActive, true)
          )
        );

      return {
        totalProperties: stats?.totalProperties || 0,
        activeWebsites: websiteCount?.activeWebsites || 0,
        propertiesForSale: stats?.propertiesForSale || 0,
        propertiesForRent: stats?.propertiesForRent || 0,
        avgPrice: stats?.avgPrice || 0
      };
    } catch (error) {
      console.error('❌ [INTERNAL] Error getting property stats:', error);
      return {
        totalProperties: 0,
        activeWebsites: 0,
        propertiesForSale: 0,
        propertiesForRent: 0,
        avgPrice: 0
      };
    }
  }
}

export const internalPropertyService = new InternalPropertyService();