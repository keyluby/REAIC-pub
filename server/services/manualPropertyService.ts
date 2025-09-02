import { db } from '../db';
import { manualProperties, type ManualProperty, type InsertManualProperty } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

export class ManualPropertyService {
  /**
   * Crear una nueva propiedad manual
   */
  async createProperty(userId: string, propertyData: Omit<InsertManualProperty, 'userId'>): Promise<ManualProperty> {
    try {
      const [property] = await db
        .insert(manualProperties)
        .values({
          ...propertyData,
          userId,
        })
        .returning();
      
      console.log(`✅ [MANUAL-PROPERTY] Created property: ${property.title}`);
      return property;
    } catch (error) {
      console.error('❌ [MANUAL-PROPERTY] Error creating property:', error);
      throw error;
    }
  }

  /**
   * Obtener todas las propiedades del usuario
   */
  async getUserProperties(userId: string): Promise<ManualProperty[]> {
    try {
      const properties = await db
        .select()
        .from(manualProperties)
        .where(eq(manualProperties.userId, userId))
        .orderBy(desc(manualProperties.createdAt));
      
      return properties;
    } catch (error) {
      console.error('❌ [MANUAL-PROPERTY] Error getting user properties:', error);
      throw error;
    }
  }

  /**
   * Obtener propiedades activas del usuario para IA
   */
  async getActiveProperties(userId: string): Promise<ManualProperty[]> {
    try {
      const properties = await db
        .select()
        .from(manualProperties)
        .where(and(
          eq(manualProperties.userId, userId),
          eq(manualProperties.isActive, true)
        ))
        .orderBy(desc(manualProperties.createdAt));
      
      return properties;
    } catch (error) {
      console.error('❌ [MANUAL-PROPERTY] Error getting active properties:', error);
      throw error;
    }
  }

  /**
   * Actualizar una propiedad
   */
  async updateProperty(
    userId: string, 
    propertyId: string, 
    updates: Partial<Omit<InsertManualProperty, 'userId' | 'id'>>
  ): Promise<ManualProperty> {
    try {
      const [property] = await db
        .update(manualProperties)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(and(
          eq(manualProperties.id, propertyId),
          eq(manualProperties.userId, userId)
        ))
        .returning();
      
      if (!property) {
        throw new Error('Property not found or access denied');
      }
      
      console.log(`✅ [MANUAL-PROPERTY] Updated property: ${property.title}`);
      return property;
    } catch (error) {
      console.error('❌ [MANUAL-PROPERTY] Error updating property:', error);
      throw error;
    }
  }

  /**
   * Eliminar una propiedad
   */
  async deleteProperty(userId: string, propertyId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(manualProperties)
        .where(and(
          eq(manualProperties.id, propertyId),
          eq(manualProperties.userId, userId)
        ));
      
      console.log(`✅ [MANUAL-PROPERTY] Deleted property: ${propertyId}`);
      return true;
    } catch (error) {
      console.error('❌ [MANUAL-PROPERTY] Error deleting property:', error);
      throw error;
    }
  }

  /**
   * Obtener una propiedad específica
   */
  async getProperty(userId: string, propertyId: string): Promise<ManualProperty | null> {
    try {
      const [property] = await db
        .select()
        .from(manualProperties)
        .where(and(
          eq(manualProperties.id, propertyId),
          eq(manualProperties.userId, userId)
        ));
      
      return property || null;
    } catch (error) {
      console.error('❌ [MANUAL-PROPERTY] Error getting property:', error);
      throw error;
    }
  }

  /**
   * Buscar propiedades por criterios (para IA)
   */
  async searchProperties(
    userId: string, 
    criteria: {
      propertyType?: string;
      minPrice?: number;
      maxPrice?: number;
      location?: string;
      bedrooms?: number;
      bathrooms?: number;
    }
  ): Promise<ManualProperty[]> {
    try {
      let query = db
        .select()
        .from(manualProperties)
        .where(and(
          eq(manualProperties.userId, userId),
          eq(manualProperties.isActive, true)
        ));

      // Aquí puedes agregar filtros adicionales basados en los criterios
      // Por simplicidad, por ahora devuelve todas las propiedades activas
      
      const properties = await query.orderBy(desc(manualProperties.createdAt));
      
      return properties;
    } catch (error) {
      console.error('❌ [MANUAL-PROPERTY] Error searching properties:', error);
      throw error;
    }
  }

  /**
   * Formatear propiedades para el contexto de IA
   */
  formatPropertiesForAI(properties: ManualProperty[]): string {
    if (properties.length === 0) {
      return "No hay propiedades disponibles en el catálogo.";
    }

    return `PROPIEDADES DISPONIBLES (${properties.length} total):

${properties.map((prop, index) => `
${index + 1}. ${prop.title}
   📍 Ubicación: ${prop.location || 'No especificada'}
   💰 Precio: ${prop.price || 'Consultar'}
   🏠 Tipo: ${prop.propertyType || 'No especificado'}
   🛏️ Habitaciones: ${prop.bedrooms || 'N/A'}
   🚿 Baños: ${prop.bathrooms || 'N/A'}
   📐 Área: ${prop.area || 'N/A'}
   📝 Descripción: ${prop.description || 'Sin descripción'}
   ${prop.features ? `✨ Características: ${prop.features}` : ''}
`).join('\n')}

IMPORTANTE: Siempre proporciona información específica y actualizada de estas propiedades cuando el cliente pregunte sobre disponibilidad.`;
  }
}

export const manualPropertyService = new ManualPropertyService();