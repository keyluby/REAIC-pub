import {
  users,
  userSettings,
  whatsappInstances,
  conversations,
  messages,
  appointments,
  leads,
  type User,
  type UpsertUser,
  type UserSettings,
  type InsertUserSettings,
  type WhatsappInstance,
  type InsertWhatsappInstance,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type Appointment,
  type InsertAppointment,
  type Lead,
  type InsertLead
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // User settings
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  upsertUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  
  // WhatsApp instances
  createWhatsappInstance(instance: InsertWhatsappInstance): Promise<WhatsappInstance>;
  getWhatsappInstance(instanceName: string): Promise<WhatsappInstance | undefined>;
  getAllWhatsappInstances(): Promise<WhatsappInstance[]>;
  getUserWhatsappInstances(userId: string): Promise<WhatsappInstance[]>;
  updateWhatsappInstanceStatus(instanceName: string, status: string, qrCode?: string): Promise<void>;
  deleteWhatsappInstance(instanceName: string): Promise<void>;
  deleteInstanceConversationsAndMessages(instanceName: string): Promise<void>;
  
  // Conversations
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationById(id: string): Promise<Conversation | undefined>;
  getConversationByPhone(whatsappInstanceId: string, clientPhone: string): Promise<Conversation | undefined>;
  getUserConversations(userId: string): Promise<Conversation[]>;
  updateConversationStatus(id: string, status: string): Promise<void>;
  
  // Messages
  createMessage(message: InsertMessage): Promise<Message>;
  getConversationMessages(conversationId: string): Promise<Message[]>;
  
  // Appointments
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  getUserAppointments(userId: string): Promise<Appointment[]>;
  updateAppointmentStatus(id: string, status: string): Promise<void>;
  
  // Leads
  createLead(lead: InsertLead): Promise<Lead>;
  getUserLeads(userId: string): Promise<Lead[]>;
  updateLeadStatus(id: string, status: string): Promise<void>;
  
  // Dashboard stats
  getDashboardStats(userId: string): Promise<{
    activeConversations: number;
    newLeads: number;
    scheduledAppointments: number;
    todayAppointments: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // User settings
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return settings;
  }

  async upsertUserSettings(settingsData: InsertUserSettings & { userId: string }): Promise<UserSettings> {
    const [settings] = await db
      .insert(userSettings)
      .values(settingsData)
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          ...settingsData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return settings;
  }

  // WhatsApp instances
  async createWhatsappInstance(instanceData: InsertWhatsappInstance): Promise<WhatsappInstance> {
    const [instance] = await db
      .insert(whatsappInstances)
      .values(instanceData)
      .returning();
    return instance;
  }

  async getWhatsappInstance(instanceName: string): Promise<WhatsappInstance | undefined> {
    const [instance] = await db.select().from(whatsappInstances).where(eq(whatsappInstances.instanceName, instanceName));
    return instance;
  }

  async getAllWhatsappInstances(): Promise<WhatsappInstance[]> {
    return await db.select().from(whatsappInstances);
  }

  async getUserWhatsappInstances(userId: string): Promise<WhatsappInstance[]> {
    return await db.select().from(whatsappInstances).where(eq(whatsappInstances.userId, userId));
  }

  async updateWhatsappInstanceStatus(instanceName: string, status: string, qrCode?: string): Promise<void> {
    const updateData: any = { status, updatedAt: new Date() };
    if (qrCode !== undefined) {
      updateData.qrCode = qrCode;
    }
    
    await db
      .update(whatsappInstances)
      .set(updateData)
      .where(eq(whatsappInstances.instanceName, instanceName));
  }

  async deleteWhatsappInstance(instanceName: string): Promise<void> {
    await db
      .delete(whatsappInstances)
      .where(eq(whatsappInstances.instanceName, instanceName));
  }

  async deleteInstanceConversationsAndMessages(instanceName: string): Promise<void> {
    // Obtener la instancia para conseguir su ID
    const instance = await this.getWhatsappInstance(instanceName);
    if (!instance) return;

    // Eliminar todos los mensajes de las conversaciones de esta instancia
    await db
      .delete(messages)
      .where(eq(messages.whatsappInstanceId, instance.id));

    // Eliminar todas las conversaciones de esta instancia
    await db
      .delete(conversations)
      .where(eq(conversations.whatsappInstanceId, instance.id));
  }

  // Conversations
  async createConversation(conversationData: InsertConversation): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values(conversationData)
      .returning();
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async getConversationById(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async getConversationByPhone(whatsappInstanceId: string, clientPhone: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.whatsappInstanceId, whatsappInstanceId),
          eq(conversations.clientPhone, clientPhone),
          eq(conversations.status, "ACTIVE")
        )
      );
    return conversation;
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.lastMessageAt));
  }

  async updateConversationStatus(id: string, status: string): Promise<void> {
    await db
      .update(conversations)
      .set({ status })
      .where(eq(conversations.id, id));
  }

  // Messages
  async createMessage(messageData: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values(messageData)
      .returning();
    return message;
  }

  async getConversationMessages(conversationId: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.timestamp);
  }

  // Appointments
  async createAppointment(appointmentData: InsertAppointment): Promise<Appointment> {
    const [appointment] = await db
      .insert(appointments)
      .values(appointmentData)
      .returning();
    return appointment;
  }

  async getUserAppointments(userId: string): Promise<Appointment[]> {
    return await db
      .select()
      .from(appointments)
      .where(eq(appointments.userId, userId))
      .orderBy(desc(appointments.scheduledAt));
  }

  async updateAppointmentStatus(id: string, status: string): Promise<void> {
    await db
      .update(appointments)
      .set({ status, updatedAt: new Date() })
      .where(eq(appointments.id, id));
  }

  // Leads
  async createLead(leadData: InsertLead): Promise<Lead> {
    const [lead] = await db
      .insert(leads)
      .values(leadData)
      .returning();
    return lead;
  }

  async getUserLeads(userId: string): Promise<Lead[]> {
    return await db
      .select()
      .from(leads)
      .where(eq(leads.userId, userId))
      .orderBy(desc(leads.createdAt));
  }

  async updateLeadStatus(id: string, status: string): Promise<void> {
    await db
      .update(leads)
      .set({ status, updatedAt: new Date() })
      .where(eq(leads.id, id));
  }

  // Dashboard stats
  async getDashboardStats(userId: string): Promise<{
    activeConversations: number;
    newLeads: number;
    scheduledAppointments: number;
    todayAppointments: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [statsResult] = await db
      .select({
        activeConversations: sql<number>`count(distinct case when ${conversations.status} = 'ACTIVE' then ${conversations.id} end)`,
        newLeads: sql<number>`count(distinct case when ${leads.status} = 'NEW' then ${leads.id} end)`,
        scheduledAppointments: sql<number>`count(distinct case when ${appointments.status} = 'SCHEDULED' then ${appointments.id} end)`,
        todayAppointments: sql<number>`count(distinct case when ${appointments.scheduledAt} >= ${today} and ${appointments.scheduledAt} < ${tomorrow} then ${appointments.id} end)`,
      })
      .from(users)
      .leftJoin(conversations, eq(conversations.userId, users.id))
      .leftJoin(leads, eq(leads.userId, users.id))
      .leftJoin(appointments, eq(appointments.userId, users.id))
      .where(eq(users.id, userId));

    return {
      activeConversations: statsResult.activeConversations || 0,
      newLeads: statsResult.newLeads || 0,
      scheduledAppointments: statsResult.scheduledAppointments || 0,
      todayAppointments: statsResult.todayAppointments || 0,
    };
  }
}

export const storage = new DatabaseStorage();
