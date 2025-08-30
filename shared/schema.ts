import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  boolean,
  integer,
  text,
  doublePrecision
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  company: varchar("company"),
  phone: varchar("phone"),
  plan: varchar("plan").default("FREE").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Assistant configuration
  assistantName: varchar("assistant_name").default("Asistente IA"),
  assistantPersonality: text("assistant_personality"),
  language: varchar("language").default("es"),
  timezone: varchar("timezone").default("America/New_York"),
  
  // WhatsApp configuration - Buffer de mensajes
  messageBufferEnabled: boolean("message_buffer_enabled").default(true),
  messageBufferTime: integer("message_buffer_time").default(5), // seconds (3-30)
  
  // Respuestas humanizadas
  humanizedResponsesEnabled: boolean("humanized_responses_enabled").default(true),
  messagingInterval: integer("messaging_interval").default(2), // seconds (1-10)
  maxMessagesPerResponse: integer("max_messages_per_response").default(4), // messages (1-6)
  
  // Legacy fields (mantener por compatibilidad)
  bufferTime: integer("buffer_time").default(10), // seconds
  maxMessageChunks: integer("max_message_chunks").default(3),
  messageDelay: integer("message_delay").default(2), // seconds
  humanizeResponses: boolean("humanize_responses").default(true),
  
  
  // CRM configuration
  alterEstateToken: varchar("alter_estate_token"),
  alterEstateCompanyId: varchar("alter_estate_company_id"),
  
  // Calendar configuration
  googleCalendarId: varchar("google_calendar_id"),
  calComUsername: varchar("cal_com_username"),
  
  // Escalación humana
  humanEscalationEnabled: boolean("human_escalation_enabled").default(true),
  notificationMethod: varchar("notification_method").default("Email y WhatsApp"),
  notificationEmail: varchar("notification_email"),
  notificationWhatsApp: varchar("notification_whatsapp"),
  
  // Notification configuration (legacy)
  emailNotifications: boolean("email_notifications").default(true),
  whatsappNotifications: boolean("whatsapp_notifications").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const whatsappInstances = pgTable("whatsapp_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  instanceName: varchar("instance_name").unique().notNull(),
  phoneNumber: varchar("phone_number"),
  status: varchar("status").default("DISCONNECTED").notNull(),
  qrCode: text("qr_code"),
  lastSeen: timestamp("last_seen"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  whatsappInstanceId: varchar("whatsapp_instance_id").notNull().references(() => whatsappInstances.id),
  
  clientPhone: varchar("client_phone").notNull(),
  clientName: varchar("client_name"),
  status: varchar("status").default("ACTIVE").notNull(),
  isEscalated: boolean("is_escalated").default(false),
  context: jsonb("context"),
  
  startedAt: timestamp("started_at").defaultNow(),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  whatsappInstanceId: varchar("whatsapp_instance_id").notNull().references(() => whatsappInstances.id),
  
  messageId: varchar("message_id").unique().notNull(),
  fromMe: boolean("from_me").notNull(),
  messageType: varchar("message_type").notNull(),
  content: text("content").notNull(),
  mediaUrl: varchar("media_url"),
  
  timestamp: timestamp("timestamp").notNull(),
  isProcessed: boolean("is_processed").default(false),
  isBuffered: boolean("is_buffered").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  conversationId: varchar("conversation_id").references(() => conversations.id),
  
  clientName: varchar("client_name").notNull(),
  clientPhone: varchar("client_phone").notNull(),
  clientEmail: varchar("client_email"),
  
  scheduledAt: timestamp("scheduled_at").notNull(),
  duration: integer("duration").default(60), // minutes
  location: varchar("location"),
  propertyId: varchar("property_id"),
  status: varchar("status").default("SCHEDULED").notNull(),
  
  // External calendar integration
  googleEventId: varchar("google_event_id"),
  calComEventId: varchar("cal_com_event_id"),
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  conversationId: varchar("conversation_id").references(() => conversations.id),
  
  fullName: varchar("full_name").notNull(),
  phone: varchar("phone").notNull(),
  email: varchar("email"),
  
  // Lead information
  interests: jsonb("interests"),
  budget: doublePrecision("budget"),
  budgetCurrency: varchar("budget_currency"),
  preferredLocation: varchar("preferred_location"),
  listingType: varchar("listing_type"), // "sale" or "rent"
  
  // AlterEstate integration
  alterEstateLeadId: varchar("alter_estate_lead_id"),
  
  status: varchar("status").default("NEW").notNull(),
  source: varchar("source").default("whatsapp").notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWhatsappInstanceSchema = createInsertSchema(whatsappInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  startedAt: true,
  lastMessageAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertWhatsappInstance = z.infer<typeof insertWhatsappInstanceSchema>;
export type WhatsappInstance = typeof whatsappInstances.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;
