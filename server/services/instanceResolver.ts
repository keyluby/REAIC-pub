/**
 * InstanceResolver - Centralized WhatsApp instance resolution service
 * 
 * Solves the critical problem of stale instance references when users
 * delete/switch WhatsApp instances. Provides automatic resolution of
 * active instances for both incoming and outgoing messages.
 */

import { storage } from '../storage';

interface InstanceResolution {
  userId: string;
  effectiveInstance: string;
  wasUpdated: boolean;
}

export class InstanceResolver {
  private static instance: InstanceResolver;
  private userActiveInstances: Map<string, string> = new Map();
  private instanceEventsBound: Set<string> = new Set();

  static getInstance(): InstanceResolver {
    if (!InstanceResolver.instance) {
      InstanceResolver.instance = new InstanceResolver();
    }
    return InstanceResolver.instance;
  }

  /**
   * Resolve instance for incoming messages
   * Returns the userId and effective instance, handling instance migrations
   */
  async resolveForIncoming(instanceName: string): Promise<InstanceResolution | null> {
    try {
      console.log(`🔍 [RESOLVER] Resolving incoming for instance: ${instanceName}`);
      
      // Get instance details from storage
      const instance = await storage.getWhatsappInstance(instanceName);
      if (!instance) {
        console.warn(`⚠️ [RESOLVER] Instance ${instanceName} not found in storage`);
        return null;
      }

      const userId = instance.userId;
      
      // Check if this is the user's active instance
      const currentActiveInstance = await storage.getActiveWhatsappInstance(userId);
      
      // If the incoming instance is not the active one, but it's connected
      if (instance.status === 'CONNECTED' && (!currentActiveInstance || currentActiveInstance.instanceName !== instanceName)) {
        console.log(`🔄 [RESOLVER] Auto-activating connected instance ${instanceName} for user ${userId}`);
        await storage.setActiveWhatsappInstance(userId, instanceName);
        await this.updateInstanceActivation(userId, instanceName);
        return { userId, effectiveInstance: instanceName, wasUpdated: true };
      }

      return { userId, effectiveInstance: instanceName, wasUpdated: false };
    } catch (error) {
      console.error(`❌ [RESOLVER] Error resolving incoming instance ${instanceName}:`, error);
      return null;
    }
  }

  /**
   * Resolve instance for outgoing messages
   * Always returns a connected instance, preferring the specified one
   */
  async resolveForOutgoing(userId: string, preferredInstance?: string): Promise<string | null> {
    try {
      console.log(`🔍 [RESOLVER] Resolving outgoing for user ${userId}, preferred: ${preferredInstance || 'none'}`);
      
      // If preferred instance is specified and connected, use it
      if (preferredInstance) {
        const instance = await storage.getWhatsappInstance(preferredInstance);
        if (instance && instance.status === 'CONNECTED' && instance.userId === userId) {
          console.log(`✅ [RESOLVER] Using preferred connected instance: ${preferredInstance}`);
          return preferredInstance;
        }
      }

      // Try to get user's active instance from cache first
      let activeInstanceName = this.userActiveInstances.get(userId);
      if (activeInstanceName) {
        const instance = await storage.getWhatsappInstance(activeInstanceName);
        if (instance && instance.status === 'CONNECTED') {
          console.log(`✅ [RESOLVER] Using cached active instance: ${activeInstanceName}`);
          return activeInstanceName;
        }
      }

      // Fallback: Get user's active instance from storage
      const activeInstance = await storage.getActiveWhatsappInstance(userId);
      if (activeInstance && activeInstance.status === 'CONNECTED') {
        console.log(`✅ [RESOLVER] Using storage active instance: ${activeInstance.instanceName}`);
        this.userActiveInstances.set(userId, activeInstance.instanceName);
        return activeInstance.instanceName;
      }

      // Last resort: Find any connected instance for the user
      const userInstances = await storage.getUserWhatsappInstances(userId);
      const connectedInstance = userInstances.find(inst => inst.status === 'CONNECTED');
      
      if (connectedInstance) {
        console.log(`🔄 [RESOLVER] Auto-activating first connected instance: ${connectedInstance.instanceName}`);
        await storage.setActiveWhatsappInstance(userId, connectedInstance.instanceName);
        this.userActiveInstances.set(userId, connectedInstance.instanceName);
        return connectedInstance.instanceName;
      }

      console.warn(`⚠️ [RESOLVER] No connected instances found for user ${userId}`);
      return null;
    } catch (error) {
      console.error(`❌ [RESOLVER] Error resolving outgoing instance for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Ensure event listeners are bound for an instance
   */
  async ensureEvents(instanceName: string): Promise<void> {
    if (this.instanceEventsBound.has(instanceName)) {
      return;
    }

    try {
      console.log(`⚡ [RESOLVER] Ensuring events for instance: ${instanceName}`);
      
      // Get instance to find userId
      const instance = await storage.getWhatsappInstance(instanceName);
      if (!instance) {
        console.warn(`⚠️ [RESOLVER] Cannot setup events for non-existent instance: ${instanceName}`);
        return;
      }
      
      // Import and setup events dynamically to avoid circular dependencies
      const { internalWebhookService } = await import('./internalWebhookService');
      await internalWebhookService.setupInstanceEvents(instanceName, instance.userId);
      
      this.instanceEventsBound.add(instanceName);
      console.log(`✅ [RESOLVER] Events bound for instance: ${instanceName}`);
    } catch (error) {
      console.error(`❌ [RESOLVER] Error setting up events for ${instanceName}:`, error);
    }
  }

  /**
   * Tear down instance references and events
   */
  async teardown(instanceName: string): Promise<void> {
    try {
      console.log(`🧹 [RESOLVER] Tearing down instance: ${instanceName}`);
      
      // Remove from bound events
      this.instanceEventsBound.delete(instanceName);
      
      // Remove from user active instances cache
      const userIds = Array.from(this.userActiveInstances.keys());
      for (const userId of userIds) {
        if (this.userActiveInstances.get(userId) === instanceName) {
          this.userActiveInstances.delete(userId);
        }
      }

      // Import and teardown events dynamically
      const { internalWebhookService } = await import('./internalWebhookService');
      internalWebhookService.removeInstanceEvents(instanceName);
      
      console.log(`✅ [RESOLVER] Teardown complete for instance: ${instanceName}`);
    } catch (error) {
      console.error(`❌ [RESOLVER] Error during teardown of ${instanceName}:`, error);
    }
  }

  /**
   * Migrate conversations to new active instance
   */
  async migrateConversations(fromInstance: string, toInstance: string, userId: string): Promise<void> {
    try {
      console.log(`🔄 [RESOLVER] Migrating conversations from ${fromInstance} to ${toInstance} for user ${userId}`);
      
      const conversations = await storage.getConversationsByInstance(fromInstance);
      const userConversations = conversations.filter(conv => conv.userId === userId);
      
      for (const conversation of userConversations) {
        await storage.updateConversationInstance(conversation.id, toInstance);
        console.log(`✅ [RESOLVER] Migrated conversation ${conversation.id} to ${toInstance}`);
      }

      console.log(`✅ [RESOLVER] Migration complete: ${userConversations.length} conversations moved`);
    } catch (error) {
      console.error(`❌ [RESOLVER] Error migrating conversations:`, error);
    }
  }

  /**
   * Handle instance activation with automatic setup
   */
  async activateInstance(userId: string, instanceName: string): Promise<void> {
    try {
      console.log(`🎯 [RESOLVER] Activating instance ${instanceName} for user ${userId}`);
      
      // Set as active in storage
      await storage.setActiveWhatsappInstance(userId, instanceName);
      
      // Update cache
      this.userActiveInstances.set(userId, instanceName);
      
      // Ensure events are bound for the new active instance
      await this.ensureEvents(instanceName);
      
      console.log(`✅ [RESOLVER] Instance ${instanceName} activated for user ${userId}`);
    } catch (error) {
      console.error(`❌ [RESOLVER] Error activating instance ${instanceName}:`, error);
    }
  }

  /**
   * Update cache when instance is activated (called from resolveForIncoming)
   */
  async updateInstanceActivation(userId: string, instanceName: string): Promise<void> {
    try {
      // Update cache
      this.userActiveInstances.set(userId, instanceName);
      
      // Ensure events are bound for the activated instance
      await this.ensureEvents(instanceName);
      
      console.log(`✅ [RESOLVER] Updated activation cache for ${instanceName}`);
    } catch (error) {
      console.error(`❌ [RESOLVER] Error updating activation cache for ${instanceName}:`, error);
    }
  }

  /**
   * Handle instance deletion with migration
   */
  async handleInstanceDeletion(instanceName: string): Promise<void> {
    try {
      console.log(`🗑️ [RESOLVER] Handling deletion of instance: ${instanceName}`);
      
      // Get instance details before deletion
      const instance = await storage.getWhatsappInstance(instanceName);
      if (!instance) {
        console.warn(`⚠️ [RESOLVER] Instance ${instanceName} not found for deletion`);
        return;
      }

      const userId = instance.userId;
      
      // Find next connected instance for the user
      const userInstances = await storage.getUserWhatsappInstances(userId);
      const nextConnectedInstance = userInstances.find(inst => 
        inst.instanceName !== instanceName && inst.status === 'CONNECTED'
      );

      // Migrate conversations if there's a replacement instance
      if (nextConnectedInstance) {
        await this.migrateConversations(instanceName, nextConnectedInstance.instanceName, userId);
        await this.activateInstance(userId, nextConnectedInstance.instanceName);
        console.log(`✅ [RESOLVER] Migrated to replacement instance: ${nextConnectedInstance.instanceName}`);
      }

      // Teardown the deleted instance
      await this.teardown(instanceName);
      
      console.log(`✅ [RESOLVER] Instance deletion handled successfully`);
    } catch (error) {
      console.error(`❌ [RESOLVER] Error handling instance deletion:`, error);
    }
  }

  /**
   * Get cached active instance for user
   */
  getCachedActiveInstance(userId: string): string | undefined {
    return this.userActiveInstances.get(userId);
  }

  /**
   * Clear cache for user (useful for testing)
   */
  clearUserCache(userId: string): void {
    this.userActiveInstances.delete(userId);
  }
}

// Export singleton instance
export const instanceResolver = InstanceResolver.getInstance();