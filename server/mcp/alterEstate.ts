import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import axios from 'axios';

// Esquemas Zod para validación de entrada
const SearchFiltersSchema = z.object({
  propertyType: z.string().optional(),
  operation: z.enum(['sale', 'rent']).optional(),
  budget: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.enum(['USD', 'RD$', 'DOP']).optional() // REMOVED DEFAULT: permite búsquedas sin currency específico
  }).optional(),
  location: z.object({
    zones: z.array(z.string()).optional(),
    city: z.string().optional(),
    flexibility: z.enum(['specific', 'flexible', 'any']).default('specific')
  }).optional(),
  specifications: z.object({
    rooms: z.number().optional(),
    bathrooms: z.number().optional(),
    areaMin: z.number().optional(),
    areaMax: z.number().optional(),
    parking: z.number().optional()
  }).optional(),
  amenities: z.array(z.string()).optional(),
  page: z.number().default(1),
  limit: z.number().default(10),
  excludeIds: z.array(z.string()).optional() // Array of property UIDs to exclude
});

const PropertyDetailSchema = z.object({
  slug: z.string(),
  uid: z.string().optional()
});

const LeadDataSchema = z.object({
  fullName: z.string(),
  phone: z.string(),
  email: z.string().optional(),
  propertyUid: z.string().optional(),
  notes: z.string().optional(),
  via: z.string().default('WhatsApp MCP'),
  relatedAgent: z.string().optional()
});

// Interfaces para respuestas
interface PropertyRecommendation {
  uid: string;
  slug: string;
  title: string;
  price: string;
  priceUSD: number;
  priceRD: number;
  currency: string;
  description: string;
  imageUrl: string;
  location: string;
  specifications: {
    rooms: number;
    bathrooms: number;
    area: number;
    parking: number;
  };
  score: number;
  reasons: string[];
  propertyUrl: string;
  isProject: boolean;
}

interface RecommendationResponse {
  count: number;
  recommendations: PropertyRecommendation[];
  rationale: string;
  hasMore: boolean;
  relaxationApplied?: string[];
}

class AlterEstateMCPServer {
  private baseUrl = 'https://secure.alterestate.com/api/v1';
  private cache = new Map<string, { data: any; expires: number }>();

  constructor(private aeToken: string, private userSettings: any) {}

  // Cache management
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

  // Currency conversion utilities
  private convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
    const exchangeRate = this.userSettings?.usdToRdRate || 62.0;
    
    if (fromCurrency === toCurrency) return amount;
    
    if (fromCurrency === 'USD' && (toCurrency === 'RD$' || toCurrency === 'DOP')) {
      return amount * exchangeRate;
    }
    
    if ((fromCurrency === 'RD$' || fromCurrency === 'DOP') && toCurrency === 'USD') {
      return amount / exchangeRate;
    }
    
    return amount;
  }

  // Property mapping and normalization
  private mapPropertyTypeToCategory(propertyType?: string): number | undefined {
    if (!propertyType) return undefined;
    
    const mappings: { [key: string]: number } = {
      'apartment': 1, 'apartamento': 1, 'apto': 1,
      'house': 2, 'casa': 2,
      'penthouse': 10, 'ático': 10,
      'villa': 13,
      'loft': 14,
      'townhouse': 17,
      'commercial': 6, 'local': 6,
      'land': 4, 'solar': 4, 'terreno': 4
    };
    
    return mappings[propertyType.toLowerCase()];
  }

  private mapOperationToListingType(operation?: string): number | undefined {
    if (!operation) return undefined;
    
    const mappings: { [key: string]: number } = {
      'sale': 1, 'venta': 1, 'compra': 1,
      'rent': 2, 'alquiler': 2, 'renta': 2
    };
    
    return mappings[operation.toLowerCase()];
  }

  // Geographic mapping for Dominican Republic
  private getGeographicSearchTerms(location: string): string[] {
    const locationLower = location.toLowerCase().trim();
    
    // Comprehensive mapping for Santo Domingo districts
    const geoMappings: { [key: string]: string[] } = {
      // Distrito Nacional (Central Santo Domingo)
      'distrito nacional': ['Distrito Nacional', 'DN', 'Zona Colonial', 'Centro'],
      'zona colonial': ['Zona Colonial', 'Distrito Nacional'],
      'gazcue': ['Gazcue', 'Distrito Nacional'],
      'bella vista': ['Bella Vista', 'Distrito Nacional'],
      'naco': ['Naco', 'Distrito Nacional'],
      'piantini': ['Piantini', 'Distrito Nacional'],
      'mirador sur': ['Mirador Sur', 'Distrito Nacional'],
      'mirador norte': ['Mirador Norte', 'Distrito Nacional'],
      'ensanche julieta': ['Ensanche Julieta', 'Distrito Nacional'],
      'ensanche serrallés': ['Ensanche Serrallés', 'Distrito Nacional'],
      'ensanche luperon': ['Ensanche Luperon', 'Distrito Nacional'],
      'renacimiento': ['Renacimiento', 'Distrito Nacional'],
      'jardines del sur': ['Jardines del Sur', 'Distrito Nacional'],
      
      // Santo Domingo Norte
      'santo domingo norte': ['Santo Domingo Norte', 'SDN'],
      'villa mella': ['Villa Mella', 'Santo Domingo Norte'],
      'sabana perdida': ['Sabana Perdida', 'Santo Domingo Norte'],
      'ciudad satelite': ['Ciudad Satelite', 'Santo Domingo Norte'],
      // 'villa altagracia': ['Villa Altagracia', 'Santo Domingo Norte'], // Removed: Villa Altagracia is San Cristóbal municipality
      'herrera': ['Herrera', 'Santo Domingo Oeste'], // Fixed: Herrera is in Santo Domingo Oeste
      
      // Santo Domingo Este
      'santo domingo este': ['Santo Domingo Este', 'SDE'],
      'boca chica': ['Boca Chica', 'Santo Domingo Este'],
      'san isidro': ['San Isidro', 'Santo Domingo Este'],
      'villa duarte': ['Villa Duarte', 'Santo Domingo Este'],
      'san luis': ['San Luis', 'Santo Domingo Este'],
      'invivienda': ['Invivienda', 'Santo Domingo Este'],
      'villa faro': ['Villa Faro', 'Santo Domingo Este'],
      'mendoza': ['Mendoza', 'Santo Domingo Este'],
      // 'villa hermosa': ['Villa Hermosa', 'Santo Domingo Este'], // Removed: Villa Hermosa is La Romana municipality
      
      // Santo Domingo Oeste
      'santo domingo oeste': ['Santo Domingo Oeste', 'SDO'],
      'engombe': ['Engombe', 'Santo Domingo Oeste'],
      // 'haina': ['Haina', 'Santo Domingo Oeste'], // Removed: Haina is outside SDO municipality
      // 'palenque': ['Palenque', 'Santo Domingo Oeste'], // Removed: Palenque is outside SDO
      'los alcarrizos': ['Los Alcarrizos', 'Santo Domingo Oeste'], // Fixed: Correct name
      'pedro brand': ['Pedro Brand', 'Santo Domingo Oeste'],
      'pantoja': ['Pantoja', 'Santo Domingo Oeste'],
      // 'nizao': ['Nizao', 'Santo Domingo Oeste'], // Removed: Nizao is outside SDO
      
      // Specific neighborhoods mentioned in user feedback
      'jacobo majluta': ['Jacobo Majluta', 'Santo Domingo Norte'],
      'cacique': ['Cacique', 'Distrito Nacional'],
      'hidalgos': ['Hidalgos', 'Distrito Nacional'],
      
      // Other major cities
      'santiago': ['Santiago', 'Santiago de los Caballeros'],
      'punta cana': ['Punta Cana', 'Bavaro'],
      'puerto plata': ['Puerto Plata'],
      'jarabacoa': ['Jarabacoa'],
      'la romana': ['La Romana'],
      'cap cana': ['Cap Cana', 'Punta Cana'],
      'bavaro': ['Bavaro', 'Punta Cana'],
      
      // Generic Santo Domingo
      'santo domingo': ['Santo Domingo', 'Distrito Nacional', 'DN']
    };
    
    // Find direct matches
    for (const [key, searchTerms] of Object.entries(geoMappings)) {
      if (locationLower.includes(key)) {
        return searchTerms;
      }
    }
    
    // If no specific mapping found, return the original location
    return [location];
  }

  // Core search functionality
  async searchRaw(filters: any, page: number = 1): Promise<any> {
    return this.searchPropertiesRaw(filters, page);
  }

  private async searchPropertiesRaw(filters: any, page: number = 1, sessionId?: string): Promise<any> {
    const cacheKey = this.getCacheKey('/properties/filter', { ...filters, page });
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      // EXPLICIT FILTER SANITIZATION - Remove disallowed keys to prevent 400 errors
      const disallowedKeys = ['rooms_max', 'currency_max', 'category_max'];
      const originalKeys = Object.keys(filters);
      
      disallowedKeys.forEach(key => {
        if (filters[key] !== undefined) {
          delete filters[key];
        }
      });
      
      const sanitizedKeys = Object.keys(filters);
      
      // Log sanitization for debugging
      if (originalKeys.length !== sanitizedKeys.length) {
        console.log(JSON.stringify({
          event: 'mcp.filters.sanitized',
          sessionId: sessionId || 'unknown',
          original_keys: originalKeys,
          sanitized_keys: sanitizedKeys,
          removed_keys: originalKeys.filter(k => !sanitizedKeys.includes(k)),
          timestamp: Date.now()
        }));
      }

      const queryParams = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
      
      queryParams.append('page', page.toString());
      
      const url = `${this.baseUrl}/properties/filter/`;
      // Remove emoji logs - structured logging only
      
      const response = await axios.get(url, {
        params: { ...filters, page }, // Include page parameter properly
        headers: {
          'aetoken': this.aeToken,
          'Content-Type': 'application/json'
        }
      });
      
      this.setCache(cacheKey, response.data, 30); // 30 minutes cache
      return response.data;
      
    } catch (error: any) {
      // Secure error logging - never expose tokens or sensitive headers
      const safeError = {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: error?.code || 'UNKNOWN_ERROR',
        status: error?.response?.status || null
      };
      
      console.log(JSON.stringify({
        event: 'mcp.http.error',
        sessionId: sessionId || 'unknown',
        endpoint: '/properties/filter',
        error: safeError,
        timestamp: Date.now()
      }));
      
      throw new Error('Failed to search properties');
    }
  }

  // Property scoring and ranking
  private scoreProperty(property: any, criteria: any): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    const weights = {
      budget: 30,
      location: 25,
      specifications: 20,
      amenities: 15,
      condition: 10
    };

    // Budget scoring
    if (criteria.budget?.max) {
      const propertyPrice = property.sale_price || property.rent_price || 0;
      if (propertyPrice > 0) {
        const budgetFit = Math.max(0, 100 - Math.abs(propertyPrice - criteria.budget.max) / criteria.budget.max * 100);
        score += (budgetFit * weights.budget) / 100;
        if (budgetFit > 80) reasons.push('Excelente ajuste al presupuesto');
        else if (budgetFit > 60) reasons.push('Buen ajuste al presupuesto');
      }
    }

    // Location scoring  
    if (criteria.location?.zones?.length) {
      const propertyLocation = `${property.sector} ${property.city}`.toLowerCase();
      const matchesLocation = criteria.location.zones.some((zone: string) => 
        propertyLocation.includes(zone.toLowerCase())
      );
      if (matchesLocation) {
        score += weights.location;
        reasons.push('Ubicación preferida');
      }
    }

    // Specifications scoring
    if (criteria.specifications?.rooms && property.room) {
      const roomDiff = Math.abs(property.room - criteria.specifications.rooms);
      if (roomDiff === 0) {
        score += weights.specifications;
        reasons.push('Número exacto de habitaciones');
      } else if (roomDiff <= 1) {
        score += weights.specifications * 0.7;
        reasons.push('Habitaciones muy cercanas a lo solicitado');
      }
    }

    return { score: Math.round(score), reasons };
  }

  // CENTRALIZED Price extraction with robust logic for all property types
  private extractSmartPrice(property: any): { price: string; priceUSD: number; priceRD: number } {
    const exchangeRate = this.userSettings?.usdToRdRate || 62.0;
    const isProject = property.is_project_v2 === true;
    const forSale = property.forSale || false;
    const forRent = property.forRent || property.forRental || false;
    const furnished = property.furnished || false;
    
    console.log(`💰 [MCP PRICE] Extracting price for: ${property.name || 'unnamed'} (Project: ${isProject}, Sale: ${forSale}, Rent: ${forRent}, Furnished: ${furnished})`);
    
    // PROJECTS: Handle development pricing with variations
    if (isProject) {
      // First try direct min/max fields
      if (property.min_price && property.max_price) {
        const minUSD = property.min_price;
        const maxUSD = property.max_price;
        return {
          price: `USD $${minUSD.toLocaleString()} - $${maxUSD.toLocaleString()}`,
          priceUSD: minUSD,
          priceRD: minUSD * exchangeRate
        };
      }
      
      // Then try variations array
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
          const currency = priceData.find((p: any) => p.price === minPrice)?.currency || 'USD';
          
          const minUSD = currency === 'USD' ? minPrice : minPrice / exchangeRate;
          const maxUSD = currency === 'USD' ? maxPrice : maxPrice / exchangeRate;
          
          if (minPrice === maxPrice) {
            return {
              price: `${currency} $${minPrice.toLocaleString()}`,
              priceUSD: minUSD,
              priceRD: minUSD * exchangeRate
            };
          } else {
            return {
              price: `${currency} $${minPrice.toLocaleString()} - $${maxPrice.toLocaleString()}`,
              priceUSD: minUSD,
              priceRD: minUSD * exchangeRate
            };
          }
        }
      }
    }
    
    // INDIVIDUAL PROPERTIES: Prioritized price selection
    const availablePrices = [];
    
    // Sale prices (furnished has priority)
    if (property.furnished_sale_price && furnished && forSale) {
      const currency = property.currency_sale_furnished || property.currency_sale || 'USD';
      availablePrices.push({
        amount: property.furnished_sale_price,
        currency,
        type: 'Venta Amueblado',
        priority: 1
      });
    }
    
    if (property.sale_price && forSale) {
      const currency = property.currency_sale || 'USD';
      availablePrices.push({
        amount: property.sale_price,
        currency,
        type: 'Venta',
        priority: furnished ? 3 : 2
      });
    }
    
    // Rent prices (furnished has priority)
    if (property.furnished_price && furnished && forRent) {
      const currency = property.currency_furnished || property.currency_rent || 'USD';
      availablePrices.push({
        amount: property.furnished_price,
        currency,
        type: 'Alquiler Amueblado',
        priority: 4
      });
    }
    
    if (property.rent_price && forRent) {
      const currency = property.currency_rent || 'USD';
      availablePrices.push({
        amount: property.rent_price,
        currency,
        type: 'Alquiler',
        priority: furnished ? 6 : 5
      });
    }
    
    if (property.rental_price && forRent) {
      const currency = property.currency_rental || property.currency_rent || 'USD';
      availablePrices.push({
        amount: property.rental_price,
        currency,
        type: 'Alquiler',
        priority: 7
      });
    }
    
    // Use best available price
    if (availablePrices.length > 0) {
      const bestPrice = availablePrices.sort((a, b) => a.priority - b.priority)[0];
      const priceUSD = bestPrice.currency === 'USD' ? bestPrice.amount : bestPrice.amount / exchangeRate;
      const priceRD = bestPrice.currency === 'USD' ? bestPrice.amount * exchangeRate : bestPrice.amount;
      
      return {
        price: `${bestPrice.currency} $${bestPrice.amount.toLocaleString()} (${bestPrice.type})`,
        priceUSD,
        priceRD
      };
    }
    
    // Enhanced fallbacks for common rental price patterns
    if (property.price_formatted) {
      const amount = this.parseFormattedPrice(property.price_formatted);
      return {
        price: property.price_formatted,
        priceUSD: amount.amountUSD,
        priceRD: amount.amountRD
      };
    }
    
    // Check for rental price in generic price field when operation suggests rental
    if (property.price) {
      const currency = property.currency || 'USD';
      const priceUSD = currency === 'USD' ? property.price : property.price / exchangeRate;
      const priceRD = currency === 'USD' ? property.price * exchangeRate : property.price;
      
      // If this is likely a rental (price is reasonable for monthly rent)
      const operationType = property.operation_type || property.type || '';
      const isRentalOperation = operationType.toLowerCase().includes('alquiler') || 
                               operationType.toLowerCase().includes('rent') ||
                               (property.price < 10000 && property.price > 500); // Likely monthly rent range
      
      const priceDisplay = isRentalOperation ? 
        `${currency === 'USD' ? 'USD' : 'RD$'} $${property.price.toLocaleString()}` :
        `${currency} $${property.price.toLocaleString()}`;
      
      return {
        price: priceDisplay,
        priceUSD,
        priceRD
      };
    }
    
    // Additional fallbacks for rental-specific fields that might exist
    if (property.monthly_rent || property.monthly_price) {
      const monthlyAmount = property.monthly_rent || property.monthly_price;
      const currency = property.currency || 'RD$';
      const priceUSD = currency === 'USD' ? monthlyAmount : monthlyAmount / exchangeRate;
      const priceRD = currency === 'USD' ? monthlyAmount * exchangeRate : monthlyAmount;
      
      return {
        price: `${currency} $${monthlyAmount.toLocaleString()} mensual`,
        priceUSD,
        priceRD
      };
    }
    
    console.log(`⚠️ [MCP PRICE] No price found for property ${property.name || property.uid}`);
    return {
      price: 'Precio a consultar',
      priceUSD: 0,
      priceRD: 0
    };
  }
  
  // Helper to parse formatted prices 
  private parseFormattedPrice(formatted: string): { amountUSD: number; amountRD: number } {
    const exchangeRate = this.userSettings?.usdToRdRate || 62.0;
    
    // Extract number and currency from formatted string
    const match = formatted.match(/(USD|RD\$|DOP)?\s*[\$]?\s*([\d,]+)/i);
    if (match) {
      const currency = match[1] || 'USD';
      const amount = parseFloat(match[2].replace(/,/g, ''));
      
      if (!isNaN(amount)) {
        const amountUSD = currency === 'USD' ? amount : amount / exchangeRate;
        const amountRD = currency === 'USD' ? amount * exchangeRate : amount;
        return { amountUSD, amountRD };
      }
    }
    
    return { amountUSD: 0, amountRD: 0 };
  }

  // CENTRALIZED Location extraction with fallbacks for address consistency
  private extractNormalizedLocation(property: any): string {
    const locationParts = [];
    
    // Priority order: sector/neighborhood -> city -> address -> fallback
    if (property.sector) {
      if (typeof property.sector === 'object' && property.sector.name) {
        locationParts.push(property.sector.name);
      } else if (typeof property.sector === 'string') {
        locationParts.push(property.sector);
      }
    }
    
    if (property.city) {
      if (typeof property.city === 'object' && property.city.name) {
        locationParts.push(property.city.name);
      } else if (typeof property.city === 'string') {
        locationParts.push(property.city);
      }
    }
    
    // If we have sector and city, use them
    if (locationParts.length >= 2) {
      return locationParts.join(', ');
    }
    
    // Otherwise try address fields
    if (property.address) {
      locationParts.push(property.address);
    }
    
    if (property.neighborhood) {
      if (typeof property.neighborhood === 'object' && property.neighborhood.name) {
        locationParts.push(property.neighborhood.name);
      } else if (typeof property.neighborhood === 'string') {
        locationParts.push(property.neighborhood);
      }
    }
    
    if (property.province) {
      if (typeof property.province === 'object' && property.province.name) {
        locationParts.push(property.province.name);
      } else if (typeof property.province === 'string') {
        locationParts.push(property.province);
      }
    }
    
    // For projects, might have development name
    if (property.is_project_v2 && property.development_name) {
      locationParts.unshift(property.development_name);
    }
    
    // Clean up and format
    const cleanLocation = locationParts
      .filter(part => part && part.trim().length > 0)
      .map(part => part.trim())
      .join(', ');
    
    // If still no location, try coordinates as fallback
    if (!cleanLocation && (property.latitude && property.longitude)) {
      return `Lat: ${property.latitude}, Lng: ${property.longitude}`;
    }
    
    return cleanLocation || 'Ubicación no especificada';
  }

  private extractTechnicalSpecs(property: any): any {
    return {
      rooms: property.room || property.rooms || 0,
      bathrooms: property.bathroom || property.bathrooms || 0,
      area: property.property_area || property.area || 0,
      parking: property.parkinglot || property.parking || 0
    };
  }

  // Main MCP tool implementations
  async recommend(params: z.infer<typeof SearchFiltersSchema>): Promise<RecommendationResponse> {
    // Create sessionId outside try for proper scoping in catch
    const sessionId = Date.now() + '-' + Math.random().toString(36).slice(2);
    let searchSession: any;
    
    try {
      // Remove emoji logs - structured logging only
      
      // Convert criteria to AlterEstate filters
      const filters: any = {};
      
      // Only filter by category if EXPLICITLY specified (allows apartments AND houses)
      if (params.propertyType) {
        const categoryId = this.mapPropertyTypeToCategory(params.propertyType);
        if (categoryId) {
          filters.category = categoryId;
        }
        // Remove emoji logs - structured logging only
      }
      // NO category filter = búsqueda incluye apartamentos, casas, y todos los tipos
      
      if (params.operation) {
        filters.listing_type = this.mapOperationToListingType(params.operation);
      }
      
      // Handle budget WITHOUT forcing currency conversion (CRITICAL FIX)
      if (params.budget) {
        // Use currency if specified, otherwise search ALL currencies (USD, DOP, RD$)
        const currency = params.budget.currency;
        
        if (params.budget.min) {
          if (currency) {
            // Convert to USD for API consistency if currency specified
            const minUSD = this.convertCurrency(params.budget.min, currency, 'USD');
            filters.value_min = Math.round(minUSD);
          } else {
            // No currency = use raw amount (searches all currencies)
            filters.value_min = Math.round(params.budget.min);
          }
        }
        
        if (params.budget.max) {
          if (currency) {
            // Convert to USD for API consistency if currency specified
            const maxUSD = this.convertCurrency(params.budget.max, currency, 'USD');
            filters.value_max = Math.round(maxUSD);
          } else {
            // No currency = use raw amount (searches all currencies)
            filters.value_max = Math.round(params.budget.max);
          }
        }
        
        // Only add currency filter if explicitly specified
        if (currency) {
          filters.currency = currency;
        }
        // NO currency parameter = API búsqueda en todas las monedas
        // Remove emoji logs - structured logging only
      }
      
      // Location mapping - use geographic search terms with comprehensive mapping
      if (params.location?.zones?.length) {
        // Use geographic mapping to get optimized search terms
        const geoTerms = this.getGeographicSearchTerms(params.location.zones[0]);
        filters.search = geoTerms[0]; // Use primary mapped term
        console.log(JSON.stringify({
          event: 'mcp.geo.mapping',
          sessionId: sessionId || 'unknown',
          original_zone: params.location.zones[0],
          mapped_search: filters.search,
          all_terms: geoTerms,
          timestamp: Date.now()
        }));
      } else if (params.location?.city) {
        // Apply geographic mapping to city as well
        const geoTerms = this.getGeographicSearchTerms(params.location.city);
        filters.search = geoTerms[0];
        console.log(JSON.stringify({
          event: 'mcp.geo.mapping',
          sessionId: sessionId || 'unknown',
          original_city: params.location.city,
          mapped_search: filters.search,
          all_terms: geoTerms,
          timestamp: Date.now()
        }));
      }
      
      // Specifications - no rooms_max to avoid API conflicts
      if (params.specifications?.rooms) {
        filters.rooms_min = params.specifications.rooms;
        // Remove rooms_max to match alterEstateService pattern
      }
      if (params.specifications?.bathrooms) {
        filters.bath_min = params.specifications.bathrooms;
      }
      if (params.specifications?.areaMin) {
        filters.area_min = params.specifications.areaMin;
      }
      if (params.specifications?.areaMax) {
        filters.area_max = params.specifications.areaMax;
      }
      
      // Remove emoji logs - structured logging only
      
      // Structured logging for debugging
      searchSession = {
        sessionId,
        originalParams: params,
        initialFilters: { ...filters },
        attempts: [],
        startTime: Date.now()
      };
      
      // Structured JSON logging for production
      console.log(JSON.stringify({
        event: 'mcp.session.start',
        sessionId: searchSession.sessionId,
        filtersApplied: Object.keys(filters),
        filterCount: Object.keys(filters).length,
        timestamp: searchSession.startTime
      }));
      
      // Search properties with timing
      const attemptStartTime = Date.now();
      let results = await this.searchPropertiesRaw(filters, params.page, sessionId);
      const attemptDuration = Date.now() - attemptStartTime;
      
      const initialAttempt = {
        attempt: 'initial',
        filtersUsed: { ...filters },
        resultCount: results.results?.length || 0,
        totalAvailable: results.count || 0,
        success: (results.results?.length || 0) > 0,
        timestamp: Date.now(),
        attemptMs: attemptDuration
      };
      
      searchSession.attempts.push(initialAttempt);
      
      // Real-time per-attempt logging
      console.log(JSON.stringify({
        event: 'mcp.attempt',
        sessionId: searchSession.sessionId,
        ...initialAttempt
      }));
      
      if (!results.results || results.results.length === 0) {
        // Remove emoji logs - structured logging only
        
        // Strategy 1: Remove optional specifications (area, exact bathrooms)
        // Remove emoji logs - structured logging only
        const relaxedFilters1 = { ...filters };
        delete relaxedFilters1.area_min;
        delete relaxedFilters1.area_max; 
        delete relaxedFilters1.bath_min;
        
        const attempt1StartTime = Date.now();
        const relaxedResults1 = await this.searchPropertiesRaw(relaxedFilters1, params.page, sessionId);
        const attempt1Duration = Date.now() - attempt1StartTime;
        
        if (relaxedResults1.results && relaxedResults1.results.length > 0) {
          // Remove emoji logs - structured logging only
          results = relaxedResults1;
          results.relaxationApplied = ['specs'];
          
          const attemptData = {
            attempt: 'relax-specs',
            filtersUsed: relaxedFilters1,
            resultCount: relaxedResults1.results.length,
            totalAvailable: relaxedResults1.count || 0,
            success: true,
            timestamp: Date.now(),
            attemptMs: attempt1Duration,
            relaxationType: 'removed area and bathroom constraints'
          };
          
          searchSession.attempts.push(attemptData);
          
          // Real-time per-attempt logging
          console.log(JSON.stringify({
            event: 'mcp.attempt',
            sessionId: searchSession.sessionId,
            ...attemptData
          }));
        } else {
          // Strategy 2: Keep only essential filters (location, budget, operation)
          // Remove emoji logs - structured logging only
          const relaxedFilters2: any = {};
          
          // Keep essential filters + GEOGRAPHIC (CRITICAL FIX)
          if (filters.listing_type) relaxedFilters2.listing_type = filters.listing_type;
          if (filters.search) relaxedFilters2.search = filters.search; // PRESERVE LOCATION
          if (filters.value_min) relaxedFilters2.value_min = filters.value_min;
          if (filters.value_max) relaxedFilters2.value_max = filters.value_max;
          if (filters.currency) relaxedFilters2.currency = filters.currency;
          
          const attempt2StartTime = Date.now();
          const relaxedResults2 = await this.searchPropertiesRaw(relaxedFilters2, params.page, sessionId);
          const attempt2Duration = Date.now() - attempt2StartTime;
          
          if (relaxedResults2.results && relaxedResults2.results.length > 0) {
            // Remove emoji logs - structured logging only
            results = relaxedResults2;
            results.relaxationApplied = ['essential'];
            
            const attemptData = {
              attempt: 'relax-essential',
              filtersUsed: relaxedFilters2,
              resultCount: relaxedResults2.results.length,
              totalAvailable: relaxedResults2.count || 0,
              success: true,
              timestamp: Date.now(),
              attemptMs: attempt2Duration,
              relaxationType: 'kept only essential filters'
            };
            
            searchSession.attempts.push(attemptData);
            
            // Real-time per-attempt logging
            console.log(JSON.stringify({
              event: 'mcp.attempt',
              sessionId: searchSession.sessionId,
              ...attemptData
            }));
          } else {
            // Strategy 3: Location only (fallback)
            // Remove emoji logs - structured logging only
            const fallbackFilters: any = {};
            if (filters.search) fallbackFilters.search = filters.search; // Use search instead of city_name
            if (filters.listing_type) fallbackFilters.listing_type = filters.listing_type;
            
            const attempt3StartTime = Date.now();
            const fallbackResults = await this.searchPropertiesRaw(fallbackFilters, params.page, sessionId);
            const attempt3Duration = Date.now() - attempt3StartTime;
            
            if (fallbackResults.results && fallbackResults.results.length > 0) {
              // Remove emoji logs - structured logging only
              results = fallbackResults;
              results.relaxationApplied = ['location-only'];
              
              const attemptData = {
                attempt: 'relax-fallback',
                filtersUsed: fallbackFilters,
                resultCount: fallbackResults.results.length,
                totalAvailable: fallbackResults.count || 0,
                success: true,
                timestamp: Date.now(),
                attemptMs: attempt3Duration,
                relaxationType: 'location and operation only'
              };
              
              searchSession.attempts.push(attemptData);
              
              // Real-time per-attempt logging
              console.log(JSON.stringify({
                event: 'mcp.attempt',
                sessionId: searchSession.sessionId,
                ...attemptData
              }));
            } else {
              // Remove emoji logs - structured logging only
              
              // Log failed attempts for all strategies
              searchSession.attempts.push({
                attempt: 'relax-specs',
                filtersUsed: relaxedFilters1,
                resultCount: 0,
                totalAvailable: 0,
                success: false,
                timestamp: Date.now(),
                relaxationType: 'removed area and bathroom constraints'
              });
              
              searchSession.attempts.push({
                attempt: 'relax-essential',
                filtersUsed: relaxedFilters2,
                resultCount: 0,
                totalAvailable: 0,
                success: false,
                timestamp: Date.now(),
                relaxationType: 'kept only essential filters'
              });
              
              searchSession.attempts.push({
                attempt: 'relax-fallback',
                filtersUsed: fallbackFilters,
                resultCount: 0,
                totalAvailable: 0,
                success: false,
                timestamp: Date.now(),
                relaxationType: 'location and operation only'
              });
              
              const sessionSummary = {
                ...searchSession,
                endTime: Date.now(),
                totalDuration: Date.now() - searchSession.startTime,
                finalResult: 'no_results_found',
                totalAttempts: searchSession.attempts.length
              };
              
              console.log(JSON.stringify({
                event: 'mcp.session.end',
                sessionId: sessionSummary.sessionId,
                finalResult: sessionSummary.finalResult,
                totalDuration: sessionSummary.totalDuration,
                totalAttempts: sessionSummary.totalAttempts,
                attempts: sessionSummary.attempts,
                timestamp: sessionSummary.endTime
              }));
              
              return {
                count: 0,
                recommendations: [],
                rationale: 'Lo siento, no encontré propiedades disponibles en la ubicación especificada. Te sugiero ampliar la zona de búsqueda o ajustar el presupuesto.',
                hasMore: false,
                relaxationApplied: ['specs', 'budget', 'location']
              };
            }
          }
        }
      }
      
      // Score and rank properties
      const scoredProperties = results.results.map((property: any) => {
        const { score, reasons } = this.scoreProperty(property, params);
        const priceInfo = this.extractSmartPrice(property);
        const specs = this.extractTechnicalSpecs(property);
        
        return {
          uid: property.uid,
          slug: property.slug,
          title: property.name || 'Propiedad sin título',
          price: priceInfo.price,
          priceUSD: priceInfo.priceUSD,
          priceRD: priceInfo.priceRD,
          currency: property.currency_sale || property.currency_rent || 'USD',
          description: property.short_description || '',
          imageUrl: property.featured_image || 'https://via.placeholder.com/400x300?text=Sin+Imagen',
          location: this.extractNormalizedLocation(property),
          specifications: specs,
          score,
          reasons,
          propertyUrl: `${this.userSettings?.realEstateWebsiteUrl || 'https://habitaterd.com'}/propiedad/${property.slug}`,
          isProject: property.is_project_v2 === true
        };
      });
      
      // Filter out excluded properties if specified
      let filteredProperties = scoredProperties;
      if (params.excludeIds && params.excludeIds.length > 0) {
        filteredProperties = scoredProperties.filter((prop: any) => {
          return !params.excludeIds!.includes(prop.uid);
        });
        console.log(JSON.stringify({
          event: 'mcp.exclusion.applied',
          sessionId: sessionId,
          originalCount: scoredProperties.length,
          filteredCount: filteredProperties.length,
          excludedCount: params.excludeIds.length,
          timestamp: Date.now()
        }));
      }

      // Sort by score and take top results
      const topRecommendations = filteredProperties
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, Math.min(params.limit, 10)); // Max 10 recommendations
      
      const relaxationInfo = results.relaxationApplied || [];
      const rationale = relaxationInfo.length > 0 
        ? `Encontré ${results.count} propiedades ajustando algunos criterios para ofrecerte mejores opciones. Seleccioné las ${topRecommendations.length} mejores.`
        : `Encontré ${results.count} propiedades que coinciden perfectamente con tus criterios. Seleccioné las ${topRecommendations.length} mejores opciones.`;
      
      // Remove emoji logs - structured logging only
      
      // Complete session logging
      const sessionSummary = {
        ...searchSession,
        endTime: Date.now(),
        totalDuration: Date.now() - searchSession.startTime,
        finalResult: 'success',
        finalResultCount: topRecommendations.length,
        totalAttempts: searchSession.attempts.length,
        relaxationApplied: relaxationInfo,
        successfulAttempt: searchSession.attempts.find((a: any) => a.success)?.attempt || 'initial'
      };
      
      console.log(JSON.stringify({
        event: 'mcp.session.end',
        sessionId: sessionSummary.sessionId,
        finalResult: sessionSummary.finalResult,
        totalDuration: sessionSummary.totalDuration,
        totalAttempts: sessionSummary.totalAttempts,
        finalResultCount: sessionSummary.finalResultCount,
        relaxationUsed: relaxationInfo.length > 0 ? relaxationInfo : ['none'],
        successfulStrategy: sessionSummary.successfulAttempt,
        attempts: sessionSummary.attempts,
        timestamp: sessionSummary.endTime
      }));
      
      return {
        count: results.count,
        recommendations: topRecommendations,
        rationale,
        hasMore: results.count > topRecommendations.length,
        relaxationApplied: relaxationInfo
      };
      
    } catch (error: any) {
      // Secure error logging - never expose tokens or sensitive headers
      const safeError = {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: error?.code || 'UNKNOWN_ERROR',
        status: error?.response?.status || null
      };
      
      console.log(JSON.stringify({
        event: 'mcp.session.error',
        sessionId: sessionId,
        error: safeError,
        timestamp: Date.now()
      }));
      
      throw new McpError(ErrorCode.InternalError, 'Error generating property recommendations');
    }
  }

  async getPropertyDetail(params: z.infer<typeof PropertyDetailSchema>, sessionId?: string): Promise<any> {
    try {
      // Remove emoji logs - structured logging only
      
      const cacheKey = this.getCacheKey(`/properties/view/${params.slug}`);
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const response = await axios.get(
        `${this.baseUrl}/properties/view/${params.slug}/`,
        {
          headers: {
            'aetoken': this.aeToken,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const property = response.data;
      const priceInfo = this.extractSmartPrice(property);
      const specs = this.extractTechnicalSpecs(property);
      
      // Enhanced property detail response
      const enrichedProperty = {
        uid: property.uid,
        slug: property.slug,
        title: property.name || property.title || 'Sin título',
        description: property.description || property.short_description || '',
        price: priceInfo.price,
        priceUSD: priceInfo.priceUSD,
        priceRD: priceInfo.priceRD,
        specifications: specs,
        location: {
          address: property.address || '',
          neighborhood: property.sector?.name || property.sector || '',
          city: property.city?.name || property.city || '',
          fullLocation: this.extractNormalizedLocation(property),
          coordinates: {
            lat: property.latitude || null,
            lng: property.longitude || null
          }
        },
        multimedia: {
          featuredImage: property.featured_image || '',
          images: property.gallery_images || [],
          virtualTour: property.virtual_tour_url || ''
        },
        amenities: Array.isArray(property.amenities) ? property.amenities : [],
        features: Array.isArray(property.features) ? property.features : [],
        agent: {
          name: property.agent?.name || '',
          phone: property.agent?.phone || '',
          email: property.agent?.email || ''
        },
        isProject: property.is_project_v2 === true,
        propertyUrl: `${this.userSettings?.realEstateWebsiteUrl || 'https://habitaterd.com'}/propiedad/${property.slug}`
      };
      
      this.setCache(cacheKey, enrichedProperty, 60); // 1 hour cache
      // Remove emoji logs - structured logging only
      
      return enrichedProperty;
      
    } catch (error: any) {
      // Secure error logging - never expose tokens or sensitive headers
      const safeError = {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: error?.code || 'UNKNOWN_ERROR',
        status: error?.response?.status || null
      };
      
      console.log(JSON.stringify({
        event: 'mcp.http.error',
        sessionId: sessionId || 'unknown',
        endpoint: '/properties/view',
        error: safeError,
        timestamp: Date.now()
      }));
      
      throw new McpError(ErrorCode.InternalError, 'Error fetching property details');
    }
  }

  async createLead(params: z.infer<typeof LeadDataSchema>): Promise<any> {
    try {
      // Remove emoji logs - structured logging only
      
      const leadData = {
        full_name: params.fullName,
        phone: params.phone,
        email: params.email || '',
        property_uid: params.propertyUid,
        notes: params.notes || '',
        via: params.via,
        related: params.relatedAgent || ''
      };
      
      const response = await axios.post(
        `${this.baseUrl}/leads/`,
        leadData,
        {
          headers: {
            'aetoken': this.aeToken,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Remove emoji logs - structured logging only
      
      return {
        success: true,
        leadId: response.data.id || response.data.uid,
        message: 'Lead creado exitosamente'
      };
      
    } catch (error: any) {
      // Remove emoji logs - structured logging only
      throw new McpError(ErrorCode.InternalError, `Error creating lead: ${error}`);
    }
  }

  async getTaxonomy(): Promise<any> {
    try {
      // Remove emoji logs - structured logging only
      
      const cacheKey = 'taxonomy_data';
      const cached = this.getCache(cacheKey);
      if (cached) return cached;
      
      // Get categories, locations, etc. from AlterEstate
      const taxonomyData = {
        propertyTypes: [
          { id: 1, name: 'apartment', label: 'Apartamentos' },
          { id: 2, name: 'house', label: 'Casas' },
          { id: 10, name: 'penthouse', label: 'Penthouse' },
          { id: 13, name: 'villa', label: 'Villas' },
          { id: 14, name: 'loft', label: 'Lofts' },
          { id: 17, name: 'townhouse', label: 'Townhouses' }
        ],
        operations: [
          { id: 1, name: 'sale', label: 'Venta' },
          { id: 2, name: 'rent', label: 'Alquiler' }
        ],
        popularZones: {
          'Santo Domingo': ['Piantini', 'Naco', 'Bella Vista', 'Evaristo Morales', 'Gazcue', 'Zona Colonial'],
          'Santiago': ['Centro', 'Cerros de Gurabo', 'Jardines Metropolitanos'],
          'Punta Cana': ['Cap Cana', 'Bavaro', 'Corales']
        },
        currencies: ['USD', 'RD$', 'DOP']
      };
      
      this.setCache(cacheKey, taxonomyData, 1440); // 24 hours cache
      
      return taxonomyData;
      
    } catch (error: any) {
      // Remove emoji logs - structured logging only
      throw new McpError(ErrorCode.InternalError, `Error fetching taxonomy: ${error}`);
    }
  }
}

// MCP Server setup
const server = new Server(
  {
    name: 'alterestate-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Global server instance
let mcpServer: AlterEstateMCPServer | null = null;

// Initialize server with user context
export function initializeMCPServer(aeToken: string, userSettings: any): AlterEstateMCPServer {
  mcpServer = new AlterEstateMCPServer(aeToken, userSettings);
  // Remove emoji logs - structured logging only
  return mcpServer;
}

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'alterestate.recommend',
        description: 'Get curated property recommendations based on client criteria with automatic currency conversion and intelligent scoring',
        inputSchema: SearchFiltersSchema,
      },
      {
        name: 'alterestate.detail',
        description: 'Get comprehensive details for a specific property including images, amenities, and agent information',
        inputSchema: PropertyDetailSchema,
      },
      {
        name: 'alterestate.search',
        description: 'Search properties with specific filters (raw search without scoring)',
        inputSchema: SearchFiltersSchema,
      },
      {
        name: 'alterestate.lead.create',
        description: 'Create a new lead in AlterEstate CRM',
        inputSchema: LeadDataSchema,
      },
      {
        name: 'alterestate.taxonomy',
        description: 'Get available property types, locations, and other taxonomy data for normalization',
        inputSchema: z.object({}),
      },
    ],
  };
});

// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (!mcpServer) {
    throw new McpError(ErrorCode.InternalError, 'MCP Server not initialized. Call initializeMCPServer first.');
  }
  
  try {
    switch (name) {
      case 'alterestate.recommend': {
        const params = SearchFiltersSchema.parse(args);
        const result = await mcpServer.recommend(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      
      case 'alterestate.detail': {
        const params = PropertyDetailSchema.parse(args);
        const result = await mcpServer.getPropertyDetail(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      
      case 'alterestate.search': {
        const searchParams = SearchFiltersSchema.parse(args);
        // For raw search, just call the basic search without scoring
        const filters: any = {};
        // Convert searchParams to filters (similar to recommend but without scoring)
        const result = await mcpServer.searchRaw(filters, searchParams.page);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      
      case 'alterestate.lead.create': {
        const params = LeadDataSchema.parse(args);
        const result = await mcpServer.createLead(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      
      case 'alterestate.taxonomy': {
        const result = await mcpServer.getTaxonomy();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(ErrorCode.InternalError, `Error executing tool ${name}: ${error}`);
  }
});

// Export for external use
export { server, AlterEstateMCPServer };

// If run directly
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Remove emoji logs - structured logging only
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.log(JSON.stringify({
      event: 'mcp.startup.error',
      error: { message: error.message, code: error.code },
      timestamp: Date.now()
    }));
  });
}