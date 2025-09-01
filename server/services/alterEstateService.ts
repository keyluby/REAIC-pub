import axios, { AxiosInstance } from 'axios';

interface AlterEstateProperty {
  cid: number;
  uid: string;
  name: string;
  slug: string;
  category: {
    id: number;
    name: string;
    name_en: string;
  };
  listing_type: Array<{
    id: number;
    listing: string;
  }>;
  sale_price: number;
  currency_sale: string;
  city: string;
  sector: string;
  short_description: string;
  room?: number;
  bathroom?: number;
  parkinglot?: number;
  property_area?: number;
  featured_image?: string;
}

interface AlterEstatePropertyDetail extends AlterEstateProperty {
  description: string;
  amenities: string[];
  gallery_image: string[];
  agents: Array<{
    id: number;
    uid: string;
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    phone: string;
    position: string;
    avatar?: string;
  }>;
  lat_long: boolean;
  featured_image?: string;
  virtual_tour?: string;
}

interface AlterEstateAgent {
  id: number;
  uid: string;
  slug: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  position: string;
  avatar?: string;
  division: string;
  team: string;
  company: string;
  bio: string;
  properties: number;
}

interface AlterEstateCity {
  name: string;
  id: number;
  province: {
    name: string;
    id: number;
  };
}

interface AlterEstateSector {
  name: string;
  id: number;
  city: string;
  province: {
    name: string;
    id: number;
  };
}

interface PropertyFilters {
  city_name?: string;
  sector?: string;
  search?: string;
  listing_type?: number; // 1: Sale, 2: Rent
  category?: number; // 1: Apartments, 2: Houses, etc.
  condition?: number; // 9: Ready, 5: In Construction
  currency?: string;
  value_min?: number;
  value_max?: number;
  rooms_min?: number;
  rooms_max?: number;
  bath_min?: number;
  bath_max?: number;
  area_min?: number;
  area_max?: number;
  agents?: string;
}

interface LeadData {
  full_name: string;
  phone: string;
  email: string;
  property_uid?: string;
  notes?: string;
  via?: string;
  related?: string; // Email del agente para asignar el lead
}

export class AlterEstateService {
  private baseUrl = 'https://secure.alterestate.com/api/v1';
  private cache = new Map<string, { data: any; expires: number }>();

  private getCacheKey(endpoint: string, params?: any): string {
    return `${endpoint}:${JSON.stringify(params || {})}`;
  }

  private getCache(key: string) {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any, ttlMinutes: number) {
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttlMinutes * 60 * 1000),
    });
  }

  /**
   * Buscar propiedades con filtros específicos
   */
  async searchProperties(
    aeToken: string, 
    filters: PropertyFilters = {},
    page: number = 1
  ): Promise<{
    count: number;
    results: AlterEstateProperty[];
    next?: string;
    previous?: string;
  }> {
    try {
      console.log('🏘️ [ALTERESTATE] Searching properties with filters:', filters);
      
      const queryParams = new URLSearchParams();
      
      // Add filters to query
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
      
      queryParams.append('page', page.toString());
      
      const response = await axios.get(
        `${this.baseUrl}/properties/filter/?${queryParams.toString()}`,
        {
          headers: {
            'aetoken': aeToken,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`🏘️ [ALTERESTATE] Found ${response.data.count} properties`);
      return response.data;
      
    } catch (error) {
      console.error('❌ [ALTERESTATE] Error searching properties:', error);
      throw new Error('Error al buscar propiedades en AlterEstate');
    }
  }

  /**
   * Obtener detalles completos de una propiedad
   */
  async getPropertyDetail(aeToken: string, propertySlug: string): Promise<AlterEstatePropertyDetail> {
    try {
      const cacheKey = this.getCacheKey(`/properties/view/${propertySlug}`);
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      console.log(`🏠 [ALTERESTATE] Getting property detail for: ${propertySlug}`);
      
      const response = await axios.get(
        `${this.baseUrl}/properties/view/${propertySlug}/`,
        {
          headers: {
            'aetoken': aeToken,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`🏠 [ALTERESTATE] Property detail retrieved: ${response.data.name}`);
      this.setCache(cacheKey, response.data, 60); // 1 hour cache
      return response.data;
      
    } catch (error) {
      console.error(`❌ [ALTERESTATE] Error getting property detail:`, error);
      throw new Error('Error al obtener detalles de la propiedad');
    }
  }

  /**
   * Listar todos los agentes activos
   */
  async getAgents(aeToken: string): Promise<AlterEstateAgent[]> {
    try {
      const cacheKey = this.getCacheKey('/agents');
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      console.log('👥 [ALTERESTATE] Getting agents list');
      
      const response = await axios.get(
        `${this.baseUrl}/agents/`,
        {
          headers: {
            'aetoken': aeToken,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`👥 [ALTERESTATE] Found ${response.data.length} active agents`);
      this.setCache(cacheKey, response.data, 60); // 1 hour cache
      return response.data;
      
    } catch (error) {
      console.error('❌ [ALTERESTATE] Error getting agents:', error);
      throw new Error('Error al obtener lista de agentes');
    }
  }

  /**
   * Obtener ciudades por país
   */
  async getCities(countryId: number = 149): Promise<AlterEstateCity[]> {
    try {
      const cacheKey = this.getCacheKey('/cities', { country: countryId });
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      console.log(`🌆 [ALTERESTATE] Getting cities for country: ${countryId}`);
      
      const response = await axios.get(
        `${this.baseUrl}/cities/?country=${countryId}`,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`🌆 [ALTERESTATE] Found ${response.data.length} cities`);
      this.setCache(cacheKey, response.data, 1440); // 24 hours cache
      return response.data;
      
    } catch (error) {
      console.error('❌ [ALTERESTATE] Error getting cities:', error);
      throw new Error('Error al obtener ciudades');
    }
  }

  /**
   * Obtener sectores por ciudad
   */
  async getSectors(cityId: number): Promise<AlterEstateSector[]> {
    try {
      const cacheKey = this.getCacheKey('/sectors', { city: cityId });
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      console.log(`🗺️ [ALTERESTATE] Getting sectors for city: ${cityId}`);
      
      const response = await axios.get(
        `${this.baseUrl}/sectors/?city=${cityId}`,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`🗺️ [ALTERESTATE] Found ${response.data.length} sectors`);
      this.setCache(cacheKey, response.data, 1440); // 24 hours cache
      return response.data;
      
    } catch (error) {
      console.error('❌ [ALTERESTATE] Error getting sectors:', error);
      throw new Error('Error al obtener sectores');
    }
  }

  /**
   * Crear un nuevo lead en AlterEstate
   */
  async createLead(apiKey: string, leadData: LeadData): Promise<{
    status: number;
    data?: any;
    message?: string;
    log_id?: string;
    deal_id?: number;
  }> {
    try {
      console.log('📝 [ALTERESTATE] Creating new lead:', leadData.full_name);
      
      const response = await axios.post(
        `${this.baseUrl}/leads/`,
        leadData,
        {
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`📝 [ALTERESTATE] Lead created successfully: ${response.data.data?.uid}`);
      return response.data;
      
    } catch (error) {
      console.error('❌ [ALTERESTATE] Error creating lead:', error);
      throw new Error('Error al crear lead en AlterEstate');
    }
  }

  /**
   * Buscar propiedades inteligentemente basado en consulta natural
   */
  async intelligentPropertySearch(
    aeToken: string, 
    query: string, 
    userLocation?: string
  ): Promise<AlterEstateProperty[]> {
    try {
      console.log(`🔍 [ALTERESTATE] Intelligent search for: "${query}"`);
      
      // Analizar la consulta para extraer criterios de búsqueda
      const filters: PropertyFilters = this.parseSearchQuery(query);
      
      // Si hay ubicación del usuario, agregarla
      if (userLocation) {
        filters.search = userLocation;
      }
      
      const result = await this.searchProperties(aeToken, filters);
      
      // Limitar a las primeras 10 propiedades para respuestas eficientes
      return result.results.slice(0, 10);
      
    } catch (error) {
      console.error('❌ [ALTERESTATE] Error in intelligent search:', error);
      throw error;
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
      filters.listing_type = 2; // Rent
    } else if (queryLower.includes('vent') || queryLower.includes('compr')) {
      filters.listing_type = 1; // Sale
    }
    
    // Detectar tipo de propiedad
    if (queryLower.includes('apartament') || queryLower.includes('apart')) {
      filters.category = 1; // Apartments
    } else if (queryLower.includes('casa') || queryLower.includes('house')) {
      filters.category = 2; // Houses
    } else if (queryLower.includes('penthouse')) {
      filters.category = 10; // Penthouse
    } else if (queryLower.includes('villa')) {
      filters.category = 13; // Villas
    }
    
    // Detectar número de habitaciones
    const roomsMatch = queryLower.match(/(\d+)\s*(hab|room|recámar|dormitor)/);
    if (roomsMatch) {
      filters.rooms_min = parseInt(roomsMatch[1]);
    }
    
    // Detectar número de baños
    const bathsMatch = queryLower.match(/(\d+)\s*(baño|bath)/);
    if (bathsMatch) {
      filters.bath_min = parseInt(bathsMatch[1]);
    }
    
    // Detectar rango de precio
    const priceMatch = queryLower.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(usd|dollar|peso)/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(',', ''));
      filters.currency = priceMatch[2].includes('usd') || priceMatch[2].includes('dollar') ? 'USD' : 'DOP';
      
      // Si es menor a 200k, asumimos es el máximo
      if (price < 200000) {
        filters.value_max = price;
      } else {
        filters.value_min = price;
      }
    }
    
    // Detectar ubicaciones específicas
    const dominicanLocations = [
      'santo domingo', 'santiago', 'punta cana', 'puerto plata', 'la romana',
      'bella vista', 'naco', 'piantini', 'gazcue', 'zona colonial', 'los prados',
      'evaristo morales', 'la esperilla', 'serralles', 'mirador sur'
    ];
    
    dominicanLocations.forEach(location => {
      if (queryLower.includes(location)) {
        filters.search = location;
      }
    });
    
    console.log('🔍 [ALTERESTATE] Parsed filters:', filters);
    return filters;
  }

  /**
   * Formatear propiedades para respuesta de IA
   */
  formatPropertiesForAI(properties: AlterEstateProperty[]): string {
    if (properties.length === 0) {
      return 'No encontré propiedades que coincidan con tus criterios. ¿Te gustaría ajustar tu búsqueda?';
    }
    
    const formatted = properties.map((property, index) => {
      const price = new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: property.currency_sale || 'USD'
      }).format(property.sale_price);
      
      const rooms = property.room ? `${property.room} hab` : '';
      const baths = property.bathroom ? `${property.bathroom} baños` : '';
      const area = property.property_area ? `${property.property_area}m²` : '';
      const details = [rooms, baths, area].filter(Boolean).join(', ');
      
      return `${index + 1}. **${property.name}** ${this.getCategoryEmoji(property.category.id)}
   - **Precio**: ${price}
   - **Ubicación**: ${property.sector}, ${property.city}
   ${details ? `- **Características**: ${details}` : ''}
   ${property.short_description ? `- **Descripción**: ${property.short_description}` : ''}
   - **ID**: ${property.uid}`;
    }).join('\n\n');
    
    return formatted + '\n\n¿Te interesa alguna de estas propiedades? Puedo enviarte más detalles, fotos o programar una visita.';
  }

  /**
   * Obtener emoji según categoría de propiedad
   */
  private getCategoryEmoji(categoryId: number): string {
    const emojiMap: { [key: number]: string } = {
      1: '🏢', // Apartments
      2: '🏠', // Houses
      3: '🏬', // Buildings
      4: '🗾', // Lots
      5: '🏨', // Hotels
      6: '🏪', // Business Premises
      7: '🏭', // Industrial Ships
      10: '🏙️', // Penthouse
      13: '🏡', // Villas
      14: '🏢', // Lofts
      17: '🏘️'  // Townhouses
    };
    
    return emojiMap[categoryId] || '🏠';
  }

  /**
   * Obtener galería de fotos y videos de una propiedad específica
   */
  async getPropertyMedia(aeToken: string, propertySlug: string): Promise<{
    images: string[];
    videos: string[];
    featuredImage?: string;
    virtualTour?: string;
  }> {
    try {
      console.log(`📸 [ALTERESTATE] Getting media for property: ${propertySlug}`);
      
      const propertyDetail = await this.getPropertyDetail(aeToken, propertySlug);
      
      const media = {
        images: propertyDetail.gallery_image || [],
        videos: [], // AlterEstate no especifica videos en la documentación actual
        featuredImage: propertyDetail.featured_image,
        virtualTour: propertyDetail.virtual_tour
      };
      
      console.log(`📸 [ALTERESTATE] Found ${media.images.length} images for property ${propertySlug}`);
      if (media.featuredImage) console.log(`🌟 [ALTERESTATE] Featured image available`);
      if (media.virtualTour) console.log(`🎥 [ALTERESTATE] Virtual tour available`);
      
      return media;
      
    } catch (error) {
      console.error(`❌ [ALTERESTATE] Error getting property media:`, error);
      throw new Error('Error al obtener medios de la propiedad');
    }
  }

  /**
   * Validar token de AlterEstate
   */
  async validateToken(aeToken: string): Promise<boolean> {
    try {
      console.log('🔐 [ALTERESTATE] Validating token...');
      
      await axios.get(`${this.baseUrl}/agents/`, {
        headers: {
          'aetoken': aeToken,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ [ALTERESTATE] Token is valid');
      return true;
      
    } catch (error) {
      console.error('❌ [ALTERESTATE] Invalid token:', error);
      return false;
    }
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * Construir enlace público de la propiedad
   */
  getPropertyPublicUrl(propertySlug: string): string {
    // AlterEstate proporciona enlaces públicos basados en el slug
    return `https://alterestate.com/properties/${propertySlug}`;
  }

  /**
   * Formatear propiedades para carrusel interactivo de WhatsApp
   */
  formatPropertiesForCarousel(properties: AlterEstateProperty[]): Array<{
    imageUrl: string;
    title: string;
    price: string;
    description: string;
    propertyUrl: string;
    uid: string;
    slug: string;
  }> {
    return properties.map(property => ({
      imageUrl: property.featured_image || 'https://via.placeholder.com/400x300?text=Sin+Imagen',
      title: property.name,
      price: `${property.currency_sale} ${property.sale_price.toLocaleString()}`,
      description: `${property.room || 0} hab • ${property.bathroom || 0} baños\n${property.sector}, ${property.city}`,
      propertyUrl: this.getPropertyPublicUrl(property.slug),
      uid: property.uid,
      slug: property.slug
    }));
  }
}

export const alterEstateService = new AlterEstateService();
export type { 
  AlterEstateProperty, 
  AlterEstatePropertyDetail, 
  AlterEstateAgent,
  PropertyFilters,
  LeadData 
};
