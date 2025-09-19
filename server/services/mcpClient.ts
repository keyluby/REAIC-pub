/**
 * MCP Client for AlterEstate Integration
 * Provides a clean interface to call MCP tools from the main application
 */

import { initializeMCPServer, AlterEstateMCPServer } from '../mcp/alterEstate.js';

interface MCPClientOptions {
  aeToken: string;
  userSettings: any;
}

export class MCPClient {
  private mcpServer: AlterEstateMCPServer | null = null;
  private isInitialized = false;

  constructor(private options: MCPClientOptions) {}

  /**
   * Initialize the MCP server with user context
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('🚀 [MCP Client] Initializing MCP server...');
      this.mcpServer = initializeMCPServer(this.options.aeToken, this.options.userSettings);
      this.isInitialized = true;
      console.log('✅ [MCP Client] MCP server initialized successfully');
    } catch (error) {
      console.error('❌ [MCP Client] Failed to initialize MCP server:', error);
      throw error;
    }
  }

  /**
   * Ensure the MCP server is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized || !this.mcpServer) {
      await this.initialize();
    }
  }

  /**
   * Get property recommendations using intelligent scoring and currency conversion
   */
  async getRecommendations(criteria: {
    propertyType?: string;
    operation?: 'sale' | 'rent';
    budget?: {
      min?: number;
      max?: number;
      currency?: 'USD' | 'RD$' | 'DOP';
    };
    location?: {
      zones?: string[];
      city?: string;
      flexibility?: 'specific' | 'flexible' | 'any';
    };
    specifications?: {
      rooms?: number;
      bathrooms?: number;
      areaMin?: number;
      areaMax?: number;
      parking?: number;
    };
    amenities?: string[];
    limit?: number;
  }) {
    await this.ensureInitialized();
    
    try {
      console.log('🎯 [MCP Client] Getting property recommendations:', JSON.stringify(criteria, null, 2));
      
      const result = await this.mcpServer!.recommend({
        ...criteria,
        page: 1,
        limit: criteria.limit || 5,
        budget: criteria.budget ? {
          ...criteria.budget,
          currency: criteria.budget.currency || 'USD'
        } : undefined,
        location: criteria.location ? {
          ...criteria.location,
          flexibility: criteria.location.flexibility || 'specific'
        } : undefined
      });
      
      console.log(`✅ [MCP Client] Retrieved ${result.recommendations.length} recommendations`);
      return result;
      
    } catch (error) {
      console.error('❌ [MCP Client] Error getting recommendations:', error);
      throw error;
    }
  }

  /**
   * Get detailed information about a specific property
   */
  async getPropertyDetail(slug: string, uid?: string) {
    await this.ensureInitialized();
    
    try {
      console.log(`🏠 [MCP Client] Getting property detail for: ${slug}`);
      
      const result = await this.mcpServer!.getPropertyDetail({ slug, uid });
      
      console.log(`✅ [MCP Client] Retrieved property detail: ${result.title}`);
      return result;
      
    } catch (error) {
      console.error('❌ [MCP Client] Error getting property detail:', error);
      throw error;
    }
  }

  /**
   * Create a new lead in AlterEstate CRM
   */
  async createLead(leadData: {
    fullName: string;
    phone: string;
    email?: string;
    propertyUid?: string;
    notes?: string;
    via?: string;
    relatedAgent?: string;
  }) {
    await this.ensureInitialized();
    
    try {
      console.log(`👤 [MCP Client] Creating lead for: ${leadData.fullName}`);
      
      const result = await this.mcpServer!.createLead({
        ...leadData,
        via: leadData.via || 'WhatsApp MCP'
      });
      
      console.log(`✅ [MCP Client] Lead created: ${result.leadId}`);
      return result;
      
    } catch (error) {
      console.error('❌ [MCP Client] Error creating lead:', error);
      throw error;
    }
  }

  /**
   * Get taxonomy data for property types, locations, etc.
   */
  async getTaxonomy() {
    await this.ensureInitialized();
    
    try {
      console.log('📚 [MCP Client] Getting taxonomy data');
      
      const result = await this.mcpServer!.getTaxonomy();
      
      console.log('✅ [MCP Client] Retrieved taxonomy data');
      return result;
      
    } catch (error) {
      console.error('❌ [MCP Client] Error getting taxonomy:', error);
      throw error;
    }
  }

  /**
   * Update user settings (e.g., exchange rate)
   */
  updateUserSettings(newSettings: any): void {
    this.options.userSettings = { ...this.options.userSettings, ...newSettings };
    
    // If MCP server is initialized, we might need to reinitialize with new settings
    if (this.isInitialized) {
      this.isInitialized = false;
      this.mcpServer = null;
    }
    
    console.log('🔄 [MCP Client] User settings updated, server will reinitialize on next call');
  }

  /**
   * Check if the MCP client is ready to use
   */
  isReady(): boolean {
    return this.isInitialized && this.mcpServer !== null;
  }
}

/**
 * Factory function to create an MCP client instance
 */
export function createMCPClient(options: MCPClientOptions): MCPClient {
  return new MCPClient(options);
}

/**
 * Global MCP client instances (one per user)
 * This helps avoid reinitializing the MCP server for every request
 */
const mcpClients = new Map<string, MCPClient>();

/**
 * Get or create MCP client for a specific user
 */
export function getMCPClient(userId: string, aeToken: string, userSettings: any): MCPClient {
  const clientKey = `${userId}_${aeToken}`;
  
  if (!mcpClients.has(clientKey)) {
    const client = createMCPClient({ aeToken, userSettings });
    mcpClients.set(clientKey, client);
    console.log(`🎯 [MCP Client] Created new client for user: ${userId}`);
  } else {
    // Update settings in case they changed
    mcpClients.get(clientKey)!.updateUserSettings(userSettings);
  }
  
  return mcpClients.get(clientKey)!;
}

/**
 * Clear MCP client cache (useful for testing or memory management)
 */
export function clearMCPClientCache(): void {
  mcpClients.clear();
  console.log('🧹 [MCP Client] Cache cleared');
}