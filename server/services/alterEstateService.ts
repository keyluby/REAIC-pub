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
   * Obtener detalles completos y estructurados de una propiedad
   */
  async getPropertyDetail(aeToken: string, propertySlug: string, userWebsiteUrl?: string): Promise<AlterEstatePropertyDetail> {
    try {
      const cacheKey = this.getCacheKey(`/properties/view/${propertySlug}`);
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      console.log(`🏠 [ALTERESTATE] Getting complete property detail for: ${propertySlug}`);
      
      const response = await axios.get(
        `${this.baseUrl}/properties/view/${propertySlug}/`,
        {
          headers: {
            'aetoken': aeToken,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const property = response.data;
      
      // 🔍 DEBUG: Mostrar campos clave para encontrar la información técnica
      console.log(`\n🔍 ==================== ALTERESTATE DEBUG ====================`);
      console.log(`🏠 PROPIEDAD: ${propertySlug}`);
      console.log(`📋 TÍTULO: ${property.name || property.title || 'Sin título'}`);
      console.log(`🔧 DEBUGGING CAMPOS TÉCNICOS...`);
      
      // Mostrar todos los campos de la propiedad de forma legible
      const allFields = Object.keys(property).map(key => `${key}: ${property[key]}`);
      console.log(`📊 CAMPOS DISPONIBLES (${allFields.length} total):`);
      allFields.forEach((field, index) => {
        if (index < 50) { // Limitar a primeros 50 campos para evitar truncado
          console.log(`   ${index + 1}. ${field}`);
        }
      });
      
      if (allFields.length > 50) {
        console.log(`   ... y ${allFields.length - 50} campos más`);
      }
      
      // Buscar campos sospechosos que puedan contener la información
      const suspects: { [key: string]: any } = {};
      Object.keys(property).forEach(key => {
        const value = property[key];
        const keyLower = key.toLowerCase();
        
        // Campos que podrían tener info técnica
        if (keyLower.includes('room') || keyLower.includes('bed') || keyLower.includes('hab') ||
            keyLower.includes('bath') || keyLower.includes('baño') || keyLower.includes('wc') ||
            keyLower.includes('area') || keyLower.includes('m2') || keyLower.includes('metro') ||
            keyLower.includes('park') || keyLower.includes('garage') || keyLower.includes('estacion') ||
            typeof value === 'number' && value > 0 && value < 20) {
          suspects[key] = value;
        }
      });
      
      console.log(`🎯 CAMPOS SOSPECHOSOS QUE PODRÍAN CONTENER INFO TÉCNICA:`);
      Object.entries(suspects).forEach(([key, value]) => {
        console.log(`   🔑 ${key}: ${value}`);
      });
      console.log(`🔍 ========================================================\n`);
      
      // Detectar si es un proyecto inmobiliario usando is_project_v2
      const isProject = property.is_project_v2 === true;
      console.log(`🏗️ [ALTERESTATE] Property is project (is_project_v2): ${isProject}`);
      
      let developmentInfo = null;
      if (isProject) {
        // El project_slug es el slug de la propiedad
        developmentInfo = await this.getDevelopmentInfo(aeToken, propertySlug);
      }
      
      // Enriquecer con información estructurada
      const enrichedProperty = {
        ...property,
        // Información básica estructurada
        basicInfo: {
          title: property.name || property.title || 'Sin título',
          description: property.description || property.short_description || '',
          type: property.property_type?.name || property.ctype || 'No especificado',
          operation: property.operation || 'No especificado'
        },
        // Detalles técnicos - usar datos de variations para proyectos
        technicalDetails: isProject && property.variations 
          ? {
              ...this.extractTechnicalDetailsFromUnits(property.variations),
              features: Array.isArray(property.features) ? property.features : [],
              amenities: Array.isArray(property.amenities) ? property.amenities : [],
              projectInfo: {
                totalUnits: property.variations?.length || 'No especificado',
                deliveryDate: property.delivery_date || 'No especificado',
                constructionStatus: property.condition_read || 'No especificado',
                floors: property.total_floors || property.floors || 'No especificado',
                buildingsCount: developmentInfo?.buildings?.length || 1
              }
            }
          : {
              area: this.extractAreaInfo(property),
              rooms: this.extractRoomsInfo(property),
              bathrooms: this.extractBathroomsInfo(property),
              parking: property.parkinglot || property.parking || property.garages || 0,
              features: Array.isArray(property.features) ? property.features : [],
              amenities: Array.isArray(property.amenities) ? property.amenities : [],
              projectInfo: null
            },
        // Información comercial
        commercialInfo: {
          price: this.extractSmartPrice(property),
          salePrice: property.sale_price || null,
          rentPrice: property.rent_price || null,
          rentalPrice: property.rental_price || null,
          furnishedPrice: property.furnished_price || null,
          furnishedSalePrice: property.furnished_sale_price || null,
          currency: property.currency || 'RD$',
          currencyFurnished: property.currency_furnished || property.currency || 'RD$',
          currencyRent: property.currency_rent || property.currency || 'RD$',
          currencySale: property.currency_sale || property.currency || 'RD$',
          priceType: property.price_type || '',
          publishedDate: property.created_at || property.publication_date || '',
          status: property.status || property.operation || 'Disponible',
          // Condiciones de venta/alquiler
          forRent: property.forRent || false,
          forRental: property.forRental || false,
          forSale: property.forSale || false,
          furnished: property.furnished || false
        },
        // Ubicación completa
        locationInfo: {
          address: property.address || property.full_address || '',
          neighborhood: property.neighborhood || property.sector?.name || '',
          city: property.city || property.sector?.city?.name || '',
          province: property.province || property.sector?.city?.state?.name || '',
          coordinates: {
            lat: property.latitude || property.lat || null,
            lng: property.longitude || property.lng || null
          },
          references: property.references || ''
        },
        // Enlaces y referencias (URL personalizada del usuario)
        links: {
          propertyUrl: this.setPropertyUrl(property, userWebsiteUrl || '', propertySlug),
          directUrl: property.url || '',
          shareUrl: property.share_url || ''
        },
        // Contenido multimedia organizado
        multimedia: {
          images: this.organizePropertyImages(property.gallery_images || property.images || property.photos || []),
          featuredImage: property.featured_image || '',
          videos: Array.isArray(property.videos) ? property.videos : [],
          youtubeVideo: property.youtubeiframe || '',
          virtualTour: property.virtual_tour_url || property.tour_360 || '',
          floorPlan: property.floor_plan || ''
        },
        // Información del agente
        agent: {
          name: property.agent?.name || property.contact_name || '',
          phone: property.agent?.phone || property.contact_phone || '',
          email: property.agent?.email || property.contact_email || '',
          company: property.agent?.company || ''
        },
        // Metadata
        metadata: {
          id: property.id,
          uid: property.uid,
          slug: propertySlug,
          views: property.views || 0,
          favorites: property.favorites || 0,
          lastUpdated: property.updated_at || property.modified_at || ''
        }
      };
      
      console.log(`🏠 [ALTERESTATE] Complete property detail retrieved: ${enrichedProperty.basicInfo.title}`);
      console.log(`📸 [ALTERESTATE] Found ${enrichedProperty.multimedia.images.length} images`);
      this.setCache(cacheKey, enrichedProperty, 60); // 1 hour cache
      return enrichedProperty;
      
    } catch (error) {
      console.error(`❌ [ALTERESTATE] Error getting property detail:`, error);
      throw new Error('Error al obtener detalles de la propiedad');
    }
  }

  /**
   * Organizar y procesar las imágenes de la propiedad
   */
  private organizePropertyImages(images: any[]): any[] {
    if (!Array.isArray(images)) return [];
    
    return images.map((image, index) => ({
      id: image.id || index,
      url: image.image || image.url || image,
      thumbnail: image.thumbnail || image.image || image.url || image,
      title: image.title || image.alt || `Imagen ${index + 1}`,
      description: image.description || '',
      isPrimary: image.is_primary || index === 0,
      order: image.order || index
    })).sort((a, b) => {
      if (a.isPrimary) return -1;
      if (b.isPrimary) return 1;
      return a.order - b.order;
    });
  }

  /**
   * Obtener información de desarrollo/proyecto inmobiliario
   */
  async getDevelopmentInfo(aeToken: string, projectSlug: string): Promise<any> {
    try {
      console.log(`🏗️ [ALTERESTATE] Getting development info for project: ${projectSlug}`);
      
      // Primero obtener los edificios del desarrollo
      const buildingsResponse = await axios.get(
        `${this.baseUrl}/projects/buildings/${projectSlug}/`,
        {
          headers: {
            'aetoken': aeToken,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const buildings = buildingsResponse.data || [];
      console.log(`🏢 [ALTERESTATE] Found ${buildings.length} buildings for development`);
      
      // Obtener las unidades del proyecto (no necesitamos building_id específico)
      const unitsResponse = await axios.get(
        `${this.baseUrl}/properties/public/units/${projectSlug}/`,
        {
          headers: {
            'aetoken': aeToken,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const units = unitsResponse.data || [];
      console.log(`🏠 [ALTERESTATE] Found ${units.length} units in project`);
      
      if (units.length > 0) {
        console.log(`📊 [ALTERESTATE] Sample unit data:`, JSON.stringify(units[0], null, 2));
      }
      
      return {
        buildings,
        units
      };
      
    } catch (error) {
      console.error(`❌ [ALTERESTATE] Error getting development info:`, error);
      return null;
    }
  }

  /**
   * Detectar si una propiedad es un proyecto inmobiliario
   */

  /**
   * Extraer precio inteligentemente basado en condiciones de la propiedad
   */
  private extractSmartPrice(property: any): string {
    const isProject = property.is_project_v2 === true;
    const forSale = property.forSale || false;
    const forRent = property.forRent || property.forRental || false;
    const furnished = property.furnished || false;
    
    console.log(`🔍 [PRICE] Extracting price for property: ${property.title || property.name}`);
    console.log(`🔍 [PRICE] isProject: ${isProject}, forSale: ${forSale}, forRent: ${forRent}, furnished: ${furnished}`);
    
    // Para PROYECTOS INMOBILIARIOS - buscar precios en campos específicos
    if (isProject) {
      console.log(`🏗️ [PRICE] Processing PROJECT pricing`);
      
      // Buscar precios de rango para proyectos
      const availableProjectPrices = [];
      
      if (property.min_price && property.max_price) {
        const currency = property.currency || property.currency_sale || property.currency_rent || 'USD';
        const minFormatted = this.formatPrice(property.min_price, currency);
        const maxFormatted = this.formatPrice(property.max_price, currency);
        console.log(`🏗️ [PRICE] Found price range: ${minFormatted} - ${maxFormatted}`);
        return `${minFormatted} - ${maxFormatted}`;
      }
      
      if (property.min_price) {
        const currency = property.currency || 'USD';
        const formatted = this.formatPrice(property.min_price, currency);
        console.log(`🏗️ [PRICE] Found min price: ${formatted}`);
        return `Desde ${formatted}`;
      }
      
      if (property.max_price) {
        const currency = property.currency || 'USD';
        const formatted = this.formatPrice(property.max_price, currency);
        console.log(`🏗️ [PRICE] Found max price: ${formatted}`);
        return `Hasta ${formatted}`;
      }
      
      // Si hay variations con precios, extraer rangos
      if (property.variations && Array.isArray(property.variations)) {
        const priceData = property.variations
          .map((v: any) => ({
            price: v.sale_price || v.rent_price || v.price,
            currency: v.currency_sale || v.currency_rent || v.currency || 'USD'
          }))
          .filter((p: any) => p.price && p.price > 0);
        
        if (priceData.length > 0) {
          const prices = priceData.map((p: any) => p.price);
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          
          // Usar la moneda de la variación que tiene el precio mínimo
          const minPriceData = priceData.find((p: any) => p.price === minPrice);
          const currency = minPriceData?.currency || 'USD';
          
          console.log(`🏗️ [PRICE] Detected currency from variations: ${currency}`);
          
          if (minPrice === maxPrice) {
            const formatted = this.formatPrice(minPrice, currency);
            console.log(`🏗️ [PRICE] Found variation price: ${formatted}`);
            return formatted;
          } else {
            const minFormatted = this.formatPrice(minPrice, currency);
            const maxFormatted = this.formatPrice(maxPrice, currency);
            console.log(`🏗️ [PRICE] Found variation range: ${minFormatted} - ${maxFormatted}`);
            return `${minFormatted} - ${maxFormatted}`;
          }
        }
      }
      
      console.log(`🏗️ [PRICE] No project-specific prices found, falling back to general fields`);
    }
    
    // Para PROPIEDADES INDIVIDUALES O FALLBACK - usar lógica de precios específicos
    const availablePrices = [];
    
    // Precios de venta
    if (property.furnished_sale_price && furnished && forSale) {
      const currency = property.currency_sale_furnished || property.currency_sale || property.currency || 'USD';
      availablePrices.push({
        amount: property.furnished_sale_price,
        currency,
        type: 'Venta Amueblado',
        priority: 1
      });
    }
    
    if (property.sale_price && forSale) {
      const currency = property.currency_sale || property.currency || 'USD';
      availablePrices.push({
        amount: property.sale_price,
        currency,
        type: 'Venta',
        priority: furnished ? 3 : 2
      });
    }
    
    // Precios de alquiler
    if (property.furnished_price && furnished && forRent) {
      const currency = property.currency_furnished || property.currency_rent || property.currency || 'USD';
      availablePrices.push({
        amount: property.furnished_price,
        currency,
        type: 'Alquiler Amueblado',
        priority: 4
      });
    }
    
    if (property.rent_price && forRent) {
      const currency = property.currency_rent || property.currency || 'USD';
      availablePrices.push({
        amount: property.rent_price,
        currency,
        type: 'Alquiler',
        priority: furnished ? 6 : 5
      });
    }
    
    if (property.rental_price && forRent) {
      const currency = property.currency_rental || property.currency_rent || property.currency || 'USD';
      availablePrices.push({
        amount: property.rental_price,
        currency,
        type: 'Alquiler',
        priority: 7
      });
    }
    
    console.log(`💰 [PRICE] Found ${availablePrices.length} specific prices:`, availablePrices.map(p => `${p.type}: ${p.amount} ${p.currency}`));
    
    // Si hay precios específicos, usar el de mayor prioridad (menor número)
    if (availablePrices.length > 0) {
      const bestPrice = availablePrices.sort((a, b) => a.priority - b.priority)[0];
      const formattedAmount = this.formatPrice(bestPrice.amount, bestPrice.currency);
      const result = `${formattedAmount} (${bestPrice.type})`;
      console.log(`💰 [PRICE] Best specific price: ${result}`);
      return result;
    }
    
    // Fallback a precios generales
    if (property.price_formatted) {
      console.log(`💰 [PRICE] Using price_formatted: ${property.price_formatted}`);
      return property.price_formatted;
    }
    
    if (property.price) {
      const currency = property.currency || 'USD';
      const formatted = this.formatPrice(property.price, currency);
      console.log(`💰 [PRICE] Using general price: ${formatted}`);
      return formatted;
    }
    
    console.log(`⚠️ [PRICE] No price found, returning Consultar precio`);
    return 'Consultar precio';
  }

  /**
   * Formatear precio con moneda
   */
  private formatPrice(amount: number | string, currency: string): string {
    if (!amount || amount === 0) return 'Consultar precio';
    
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return 'Consultar precio';
    
    const currencySymbol = currency === 'USD' ? 'US$' : currency === 'DOP' ? 'RD$' : currency;
    
    // Formatear con comas para miles
    const formatted = numAmount.toLocaleString('en-US');
    return `${currencySymbol} ${formatted}`;
  }

  /**
   * Convertir precio entre monedas usando tasa de cambio del usuario
   */
  async convertCurrency(amount: number, fromCurrency: string, toCurrency: string, exchangeRate: number): Promise<number> {
    if (!amount || amount <= 0) return 0;
    if (fromCurrency === toCurrency) return amount;
    
    if (fromCurrency === 'USD' && toCurrency === 'DOP') {
      return amount * exchangeRate;
    } else if (fromCurrency === 'DOP' && toCurrency === 'USD') {
      return amount / exchangeRate;
    }
    
    return amount; // No conversion available
  }

  /**
   * Expandir rango de precios para incluir conversiones automáticas
   */
  async expandPriceRangeWithConversions(
    minPrice: number | null, 
    maxPrice: number | null, 
    searchCurrency: string,
    exchangeRate: number = 60.0
  ): Promise<{ expandedMinPrice: number | null, expandedMaxPrice: number | null }> {
    
    if (!minPrice && !maxPrice) {
      return { expandedMinPrice: null, expandedMaxPrice: null };
    }
    
    console.log(`💱 [CONVERSION] Original range: ${minPrice || 'null'}-${maxPrice || 'null'} ${searchCurrency}`);
    console.log(`💱 [CONVERSION] Exchange rate: 1 USD = ${exchangeRate} DOP`);
    
    let expandedMinPrice = minPrice;
    let expandedMaxPrice = maxPrice;
    
    if (searchCurrency === 'USD') {
      // El usuario busca en USD, pero también queremos incluir propiedades en DOP
      // Convertir el rango USD a DOP para ampliar la búsqueda
      if (minPrice) {
        const dopMin = await this.convertCurrency(minPrice, 'USD', 'DOP', exchangeRate);
        expandedMinPrice = Math.min(minPrice, dopMin);
        console.log(`💱 [CONVERSION] USD ${minPrice} = DOP ${dopMin}`);
      }
      
      if (maxPrice) {
        const dopMax = await this.convertCurrency(maxPrice, 'USD', 'DOP', exchangeRate);
        expandedMaxPrice = Math.max(maxPrice, dopMax);
        console.log(`💱 [CONVERSION] USD ${maxPrice} = DOP ${dopMax}`);
      }
    } else if (searchCurrency === 'DOP') {
      // El usuario busca en DOP, pero también queremos incluir propiedades en USD
      // Convertir el rango DOP a USD para ampliar la búsqueda
      if (minPrice) {
        const usdMin = await this.convertCurrency(minPrice, 'DOP', 'USD', exchangeRate);
        expandedMinPrice = Math.min(minPrice, usdMin);
        console.log(`💱 [CONVERSION] DOP ${minPrice} = USD ${usdMin}`);
      }
      
      if (maxPrice) {
        const usdMax = await this.convertCurrency(maxPrice, 'DOP', 'USD', exchangeRate);
        expandedMaxPrice = Math.max(maxPrice, usdMax);
        console.log(`💱 [CONVERSION] DOP ${maxPrice} = USD ${usdMax}`);
      }
    }
    
    console.log(`💱 [CONVERSION] Expanded range: ${expandedMinPrice || 'null'}-${expandedMaxPrice || 'null'}`);
    
    return { expandedMinPrice, expandedMaxPrice };
  }

  /**
   * Extraer información técnica de unidades de desarrollo
   */
  private extractTechnicalDetailsFromUnits(units: any[]): any {
    if (!units || units.length === 0) {
      return {
        area: 'No especificado',
        rooms: 0,
        bathrooms: 0,
        parking: 0
      };
    }
    
    // Analizar todas las unidades para obtener rangos
    // Según la documentación, los campos son: property_area, room, bathroom, parkinglot
    const areas = units.map(u => u.property_area || u.area || u.area_private || 0).filter(a => a > 0);
    const rooms = units.map(u => u.room || u.rooms || u.bedrooms || 0).filter(r => r > 0);
    const bathrooms = units.map(u => u.bathroom || u.bathrooms || 0).filter(b => b > 0);
    const parking = units.map(u => u.parkinglot || u.parking || u.garages || 0).filter(p => p > 0);
    
    const getRange = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      return min === max ? min : `Desde ${min} hasta ${max}`;
    };
    
    return {
      area: areas.length > 0 ? `${getRange(areas)} m²` : 'No especificado',
      rooms: getRange(rooms),
      bathrooms: getRange(bathrooms),
      parking: getRange(parking)
    };
  }

  /**
   * Extraer información de área (maneja propiedades individuales y proyectos)
   */
  private extractAreaInfo(property: any): string {
    // Para proyectos inmobiliarios (is_project_v2 = true), usar rangos si están disponibles
    if (property.is_project_v2 === true && (property.min_area || property.max_area)) {
      if (property.min_area && property.max_area) {
        return property.min_area === property.max_area 
          ? `${property.min_area} m²`
          : `Desde ${property.min_area} hasta ${property.max_area} m²`;
      }
      if (property.min_area) return `Desde ${property.min_area} m²`;
      if (property.max_area) return `Hasta ${property.max_area} m²`;
    }
    
    // Para propiedades individuales (is_project_v2 = false) - usar campos correctos de AlterEstate
    if (property.property_area) {
      const measurer = property.property_area_measurer || 'Mt2';
      return `${property.property_area} ${measurer}`;
    }
    
    // Fallback para otros campos de área
    return property.area || property.area_private || property.area_total || property.construction_area || 'No especificado';
  }

  /**
   * Extraer información de habitaciones (maneja propiedades individuales y proyectos)
   */
  private extractRoomsInfo(property: any): string | number {
    // Para proyectos inmobiliarios (is_project_v2 = true), usar rangos si están disponibles
    if (property.is_project_v2 === true && (property.min_rooms || property.max_rooms)) {
      if (property.min_rooms && property.max_rooms) {
        return property.min_rooms === property.max_rooms 
          ? property.min_rooms
          : `Desde ${property.min_rooms} hasta ${property.max_rooms}`;
      }
      if (property.min_rooms) return `Desde ${property.min_rooms}`;
      if (property.max_rooms) return `Hasta ${property.max_rooms}`;
    }
    
    // Para propiedades individuales (is_project_v2 = false) - usar campo correcto de AlterEstate
    return property.room || property.rooms || property.bedrooms || 0;
  }

  /**
   * Extraer información de baños (maneja propiedades individuales y proyectos)
   */
  private extractBathroomsInfo(property: any): string | number {
    // Para proyectos inmobiliarios (is_project_v2 = true), usar rangos si están disponibles
    if (property.is_project_v2 === true && (property.min_bathrooms || property.max_bathrooms)) {
      if (property.min_bathrooms && property.max_bathrooms) {
        return property.min_bathrooms === property.max_bathrooms 
          ? property.min_bathrooms
          : `Desde ${property.min_bathrooms} hasta ${property.max_bathrooms}`;
      }
      if (property.min_bathrooms) return `Desde ${property.min_bathrooms}`;
      if (property.max_bathrooms) return `Hasta ${property.max_bathrooms}`;
    }
    
    // Para propiedades individuales (is_project_v2 = false) - usar campo correcto de AlterEstate
    return property.bathroom || property.bathrooms || 0;
  }

  /**
   * Establecer URL personalizada para las propiedades
   */
  private setPropertyUrl(property: any, userWebsiteUrl: string, propertySlug: string): string {
    if (!userWebsiteUrl) return '';
    
    // Asegurar que la URL termine con /
    const baseUrl = userWebsiteUrl.endsWith('/') ? userWebsiteUrl : userWebsiteUrl + '/';
    
    // Construir URL con "propiedad" en lugar de "properties"
    return `${baseUrl}propiedad/${propertySlug}/`;
  }

  /**
   * Obtener una propiedad aleatoria completa para extracción automática
   */
  async getRandomPropertyComplete(aeToken: string, userWebsiteUrl?: string): Promise<AlterEstatePropertyDetail | null> {
    try {
      console.log('🎲 [ALTERESTATE] Getting random property for automatic extraction...');
      
      // Primero obtener la lista de propiedades
      const searchResult = await this.searchProperties(aeToken, {}, 1);
      
      if (!searchResult.results || searchResult.results.length === 0) {
        console.log('🚫 [ALTERESTATE] No properties found for random selection');
        return null;
      }
      
      // Seleccionar una propiedad aleatoria
      const randomIndex = Math.floor(Math.random() * Math.min(searchResult.results.length, 20));
      const selectedProperty = searchResult.results[randomIndex];
      
      console.log(`🎲 [ALTERESTATE] Selected random property: ${selectedProperty.slug}`);
      
      // Obtener el detalle completo de la propiedad seleccionada
      const propertyDetail = await this.getPropertyDetail(aeToken, selectedProperty.slug, userWebsiteUrl);
      
      return propertyDetail;
      
    } catch (error) {
      console.error('❌ [ALTERESTATE] Error getting random property:', error);
      return null;
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
  async getCities(aeToken: string, countryId: number = 149): Promise<AlterEstateCity[]> {
    try {
      const cacheKey = this.getCacheKey('/cities', { country: countryId });
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      console.log(`🌆 [ALTERESTATE] Getting cities for country: ${countryId}`);
      
      const response = await axios.get(
        `${this.baseUrl}/cities/?country=${countryId}`,
        {
          headers: {
            'aetoken': aeToken,
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
  async getSectors(aeToken: string, cityId: number): Promise<AlterEstateSector[]> {
    try {
      const cacheKey = this.getCacheKey('/sectors', { city: cityId });
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      console.log(`🗺️ [ALTERESTATE] Getting sectors for city: ${cityId}`);
      
      const response = await axios.get(
        `${this.baseUrl}/sectors/?city=${cityId}`,
        {
          headers: {
            'aetoken': aeToken,
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
      
      // Use exactly the minimal data that works in curl, no optional fields
      const apiLeadData = {
        full_name: leadData.full_name,
        phone: leadData.phone,
        email: leadData.email
      };
      
      console.log('📝 [ALTERESTATE] API-compliant lead data:', apiLeadData);
      
      console.log('🔧 [ALTERESTATE] Exact curl replication - URL:', `${this.baseUrl}/leads/`);
      console.log('🔧 [ALTERESTATE] Exact curl replication - Data:', apiLeadData);
      
      // Simplified approach: use axios with minimal configuration to match curl exactly
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/leads/`,
        data: apiLeadData,
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000,
        validateStatus: () => true, // Accept all status codes, we'll handle them manually
        maxRedirects: 0 // Disable redirects like curl
      });
      
      console.log(`✅ [ALTERESTATE] Lead API response:`, {
        status: response.status,
        data: response.data
      });
      
      // Handle success responses (201 is the expected success status)
      if (response.status === 201) {
        return {
          status: response.status,
          data: response.data,
          message: 'Lead creado exitosamente',
          log_id: response.data.log_id,
          deal_id: response.data.deal_id
        };
      }
      
      // Handle duplicate lead response (200 status)
      if (response.status === 200 && response.data.message?.includes('already exists')) {
        return {
          status: response.status,
          data: response.data,
          message: 'Lead ya existía en el sistema',
          log_id: response.data.log_id
        };
      }
      
      // Unexpected success status
      return {
        status: response.status,
        data: response.data,
        message: `Respuesta inesperada: ${response.status}`
      };
      
    } catch (error: any) {
      console.error('❌ [ALTERESTATE] Error creating lead:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
          data: error.config?.data
        }
      });
      
      // Return structured error responses for better frontend handling
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        return {
          status: status,
          message: `Error ${status}: ${data?.message || error.response.statusText || 'Error desconocido'}`
        };
      } else if (error.request) {
        return {
          status: 500,
          message: 'No se pudo conectar con AlterEstate - verificar conectividad'
        };
      } else {
        return {
          status: 500,
          message: `Error de configuración: ${error.message}`
        };
      }
    }
  }

  /**
   * Eliminar un lead de AlterEstate
   */
  async deleteLead(apiKey: string, leadId: string): Promise<boolean> {
    try {
      console.log('🗑️ [ALTERESTATE] Deleting lead:', leadId);
      
      const response = await axios.delete(
        `${this.baseUrl}/leads/${leadId}/`,
        {
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`🗑️ [ALTERESTATE] Lead deleted successfully`);
      return true;
      
    } catch (error) {
      console.error('❌ [ALTERESTATE] Error deleting lead:', error);
      return false;
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
      
      // Analizar la consulta usando IA para extraer criterios más precisos
      const filters: PropertyFilters = await this.analyzeQueryWithAI(query);
      
      // Si hay ubicación del usuario, agregarla o combinarla
      if (userLocation && !filters.search) {
        filters.search = userLocation;
      }
      
      console.log(`🎯 [ALTERESTATE] Final filters for API:`, filters);
      
      const result = await this.searchProperties(aeToken, filters);
      
      console.log(`📊 [ALTERESTATE] API returned ${result.results.length} properties from ${result.count} total`);
      
      // Limitar a las primeras 10 propiedades para respuestas eficientes
      return result.results.slice(0, 10);
      
    } catch (error) {
      console.error('❌ [ALTERESTATE] Error in intelligent search:', error);
      throw error;
    }
  }

  /**
   * Analizar consulta usando IA para extraer criterios más precisos
   */
  private async analyzeQueryWithAI(query: string): Promise<PropertyFilters> {
    try {
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const prompt = `Analiza esta consulta de búsqueda de propiedades inmobiliarias y extrae TODOS los criterios específicos posibles:

Consulta: "${query}"

Extrae criterios para formar filtros API precisos. Considera contexto dominicano.

CATEGORÍAS DE PROPIEDADES:
1 = Apartamentos
2 = Casas  
3 = Edificios
4 = Solares
5 = Hoteles
6 = Locales Comerciales
7 = Naves Industriales
10 = Penthouse
13 = Villas
14 = Lofts
17 = Townhouses

TIPOS DE OPERACIÓN:
1 = Venta/Compra
2 = Alquiler

UBICACIONES ESPECÍFICAS DOMINICANAS:
- Santo Domingo y sectores: Piantini, Naco, Bella Vista, Evaristo Morales, Gazcue, Zona Colonial, etc.
- Santiago, Punta Cana, Puerto Plata, La Romana

Responde en JSON:
{
  "listing_type": number_o_null,
  "category": number_o_null,
  "rooms_min": number_o_null,
  "rooms_max": number_o_null,
  "bath_min": number_o_null,
  "bath_max": number_o_null,
  "value_min": number_o_null,
  "value_max": number_o_null,
  "currency": "USD_o_DOP_o_null",
  "search": "ubicacion_especifica_o_null",
  "property_area_min": number_o_null,
  "property_area_max": number_o_null
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.3,
      });

      const filters = JSON.parse(response.choices[0].message.content || '{}');
      console.log(`🧠 [ALTERESTATE] AI analyzed query "${query}" -> filters:`, filters);
      
      // Filtrar valores null y convertir a PropertyFilters
      const cleanFilters: PropertyFilters = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          (cleanFilters as any)[key] = value;
        }
      });
      
      return cleanFilters;
      
    } catch (error) {
      console.error('❌ [ALTERESTATE] Error analyzing query with AI, falling back to basic parsing:', error);
      return this.parseSearchQuery(query);
    }
  }

  /**
   * Analizar consulta de texto natural para extraer filtros (método básico de respaldo)
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
      
      // Asegurar que las imágenes sean URLs string, no objetos
      const processImageUrls = (imageData: any): string[] => {
        if (!imageData) return [];
        if (Array.isArray(imageData)) {
          return imageData.map(img => {
            if (typeof img === 'string') return img;
            if (typeof img === 'object' && img.url) return img.url;
            if (typeof img === 'object' && img.image) return img.image;
            console.warn('🚨 [ALTERESTATE] Unexpected image format:', img);
            return null;
          }).filter(url => url !== null);
        }
        return [];
      };
      
      const processFeaturedImage = (imageData: any): string | undefined => {
        if (!imageData) return undefined;
        if (typeof imageData === 'string') return imageData;
        if (typeof imageData === 'object' && imageData.url) return imageData.url;
        if (typeof imageData === 'object' && imageData.image) return imageData.image;
        console.warn('🚨 [ALTERESTATE] Unexpected featured image format:', imageData);
        return undefined;
      };

      const media = {
        images: processImageUrls(propertyDetail.gallery_image),
        videos: [], // AlterEstate no especifica videos en la documentación actual
        featuredImage: processFeaturedImage(propertyDetail.featured_image),
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
      
      // Use the properties filter endpoint with minimal parameters to validate token
      // This endpoint is more reliable than /agents/
      const response = await axios.get(`${this.baseUrl}/properties/filter/?page=1`, {
        headers: {
          'aetoken': aeToken,
          'Content-Type': 'application/json'
        }
      });
      
      // Check if we get a valid response structure
      if (response.status === 200 && response.data && typeof response.data.count !== 'undefined') {
        console.log('✅ [ALTERESTATE] Token is valid');
        return true;
      }
      
      console.log('❌ [ALTERESTATE] Invalid response structure');
      return false;
      
    } catch (error: any) {
      console.error('❌ [ALTERESTATE] Invalid token:', error?.response?.status, error?.response?.data);
      return false;
    }
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * Construir enlace público de la propiedad
   */
  getPropertyPublicUrl(propertySlug: string, userWebsiteUrl?: string): string {
    // Si el usuario tiene configurada una URL personalizada, usarla
    if (userWebsiteUrl) {
      // Asegurar que la URL termine sin slash
      const baseUrl = userWebsiteUrl.replace(/\/$/, '');
      return `${baseUrl}/propiedad/${propertySlug}`;
    }
    
    // Fallback: URL genérica de AlterEstate
    return `https://alterestate.com/properties/${propertySlug}`;
  }

  /**
   * Formatear propiedades para carrusel interactivo de WhatsApp
   */
  formatPropertiesForCarousel(
    properties: AlterEstateProperty[], 
    userWebsiteUrl?: string
  ): Array<{
    imageUrl: string;
    title: string;
    price: string;
    description: string;
    propertyUrl: string;
    uid: string;
    slug: string;
    type: string;
    area?: string;
  }> {
    return properties.map(property => {
      // Manejar precio con lógica de negocio mejorada
      const salePrice = property.sale_price;
      const rentPrice = property.rent_price;
      const currency = property.currency_sale || property.currency_rent || 'RD$';
      
      let formattedPrice = 'Precio a consultar';
      if (salePrice && typeof salePrice === 'number') {
        formattedPrice = `${currency} ${salePrice.toLocaleString()}`;
      } else if (rentPrice && typeof rentPrice === 'number') {
        formattedPrice = `${currency} ${rentPrice.toLocaleString()}/mes`;
      }

      // Mejorar información de habitaciones y baños
      const rooms = property.room || 0;
      const bathrooms = property.bathroom || 0;
      const area = property.constructed_area || property.total_area;
      
      // Ubicación más específica
      const sector = property.sector || '';
      const city = property.city || '';
      const location = [sector, city].filter(Boolean).join(', ') || 'Ubicación no especificada';
      
      // Título más descriptivo
      const propertyType = property.property_type?.name || property.ctype || 'Propiedad';
      const title = property.name || `${propertyType} en ${sector || city || 'Zona Exclusiva'}`;

      // Descripción enriquecida con emojis
      let description = '';
      if (rooms > 0) description += `🛏️ ${rooms} hab`;
      if (bathrooms > 0) description += `${rooms > 0 ? ' • ' : ''}🚿 ${bathrooms} baños`;
      if (area) description += `${(rooms > 0 || bathrooms > 0) ? ' • ' : ''}📐 ${area}m²`;
      description += `\n📍 ${location}`;

      return {
        imageUrl: property.featured_image || 'https://via.placeholder.com/400x300?text=Sin+Imagen',
        title: title,
        price: formattedPrice,
        description: description,
        propertyUrl: this.getPropertyPublicUrl(property.slug, userWebsiteUrl),
        uid: property.uid,
        slug: property.slug,
        type: propertyType,
        area: area?.toString()
      };
    });
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
