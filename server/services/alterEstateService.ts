import axios from 'axios';

export class AlterEstateService {
  private baseUrl = 'https://secure.alterestate.com/api/v1';
  private cache = new Map<string, { data: any; expires: number }>();

  private async makeRequest(endpoint: string, token: string, params?: any) {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        params,
      });
      return response.data;
    } catch (error) {
      console.error(`AlterEstate API error for ${endpoint}:`, error);
      throw new Error(`Failed to fetch data from AlterEstate: ${endpoint}`);
    }
  }

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

  async getAllProperties(token: string, filters: any = {}) {
    const cacheKey = this.getCacheKey('/listings', filters);
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const data = await this.makeRequest('/listings', token, filters);
    this.setCache(cacheKey, data, 60); // 1 hour cache
    return data;
  }

  async getPropertyDetail(token: string, propertySlug: string) {
    const cacheKey = this.getCacheKey(`/listings/${propertySlug}`);
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const data = await this.makeRequest(`/listings/${propertySlug}`, token);
    this.setCache(cacheKey, data, 60); // 1 hour cache
    return data;
  }

  async createLead(token: string, leadData: any) {
    try {
      const response = await axios.post(`${this.baseUrl}/leads`, leadData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error creating lead in AlterEstate:', error);
      throw new Error('Failed to create lead in AlterEstate');
    }
  }

  async getCities(token: string, countryId: number = 149) {
    const cacheKey = this.getCacheKey('/locations/cities', { country_id: countryId });
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const data = await this.makeRequest('/locations/cities', token, { country_id: countryId });
    this.setCache(cacheKey, data, 1440); // 24 hours cache
    return data;
  }

  async getSectors(token: string, cityId: number) {
    const cacheKey = this.getCacheKey(`/locations/sectors`, { city_id: cityId });
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const data = await this.makeRequest('/locations/sectors', token, { city_id: cityId });
    this.setCache(cacheKey, data, 1440); // 24 hours cache
    return data;
  }

  async getAgents(token: string) {
    const cacheKey = this.getCacheKey('/agents');
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const data = await this.makeRequest('/agents', token);
    this.setCache(cacheKey, data, 60); // 1 hour cache
    return data;
  }

  async getUnits(token: string, projectSlug: string) {
    const cacheKey = this.getCacheKey(`/projects/${projectSlug}/units`);
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const data = await this.makeRequest(`/projects/${projectSlug}/units`, token);
    this.setCache(cacheKey, data, 60); // 1 hour cache
    return data;
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      await this.makeRequest('/me', token);
      return true;
    } catch (error) {
      return false;
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

export const alterEstateService = new AlterEstateService();
