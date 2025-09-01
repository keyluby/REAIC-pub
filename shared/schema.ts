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
  userId: varchar("user_id").notNull().unique().references(() => users.id),
  
  // Assistant configuration
  assistantName: varchar("assistant_name").default("Asistente IA"),
  assistantPersonality: text("assistant_personality"),
  systemPrompt: text("system_prompt"),
  language: varchar("language").default("es"),
  timezone: varchar("timezone").default("America/New_York"),
  
  // AI Training configuration
  trainingEnabled: boolean("training_enabled").default(false),
  trainingUrls: text("training_urls").array().default(sql`'{}'::text[]`),
  trainingDocs: text("training_docs").array().default(sql`'{}'::text[]`),
  
  // Database integration (only one at a time)
  databaseType: varchar("database_type"), // 'sql', 'airtable', 'google_sheets'
  sqlConnectionString: text("sql_connection_string"),
  airtableApiKey: varchar("airtable_api_key"),
  airtableBaseId: varchar("airtable_base_id"),
  googleSheetsId: varchar("google_sheets_id"),
  databaseInstructions: text("database_instructions"),
  
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
  alterEstateApiKey: varchar("alter_estate_api_key"), // Para crear leads
  alterEstateCompanyId: varchar("alter_estate_company_id"),
  alterEstateEnabled: boolean("alter_estate_enabled").default(false),
  realEstateWebsiteUrl: varchar("real_estate_website_url"), // URL del sitio web de la inmobiliaria
  
  // Web Scraping configuration
  webScrapingEnabled: boolean("web_scraping_enabled").default(false),
  defaultScrapingInterval: integer("default_scraping_interval").default(24), // hours
  maxPropertiesPerSite: integer("max_properties_per_site").default(1000),
  autoDetectPatterns: boolean("auto_detect_patterns").default(true),
  enableImageScraping: boolean("enable_image_scraping").default(true),
  
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

// Web Scraping Tables
export const scrapedWebsites = pgTable("scraped_websites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  url: varchar("url").notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  
  // Scraping configuration
  isActive: boolean("is_active").default(true),
  scrapingInterval: integer("scraping_interval").default(24), // hours
  maxPages: integer("max_pages").default(100),
  
  // Auto-detected patterns
  propertyUrlPattern: varchar("property_url_pattern"),
  titleSelector: varchar("title_selector"),
  priceSelector: varchar("price_selector"),
  imageSelector: varchar("image_selector"),
  locationSelector: varchar("location_selector"),
  descriptionSelector: varchar("description_selector"),
  
  // Metadata
  lastScrapedAt: timestamp("last_scraped_at"),
  totalPropertiesFound: integer("total_properties_found").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const scrapedProperties = pgTable("scraped_properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  websiteId: varchar("website_id").notNull().references(() => scrapedWebsites.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Property URL (unique identifier)
  sourceUrl: varchar("source_url").notNull().unique(),
  urlHash: varchar("url_hash").notNull().unique(), // Para evitar duplicados
  
  // Basic property information
  title: varchar("title").notNull(),
  description: text("description"),
  price: doublePrecision("price"),
  currency: varchar("currency").default("RD$"),
  priceText: varchar("price_text"), // Texto original del precio
  
  // Property details
  propertyType: varchar("property_type"), // "apartment", "house", "villa", etc.
  listingType: varchar("listing_type"), // "sale", "rent"
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  area: doublePrecision("area"),
  areaUnit: varchar("area_unit").default("m2"),
  
  // Location
  location: varchar("location"),
  city: varchar("city"),
  sector: varchar("sector"),
  country: varchar("country").default("Dominican Republic"),
  
  // Status
  status: varchar("status").default("ACTIVE").notNull(),
  isAvailable: boolean("is_available").default(true),
  
  // Metadata
  scrapedAt: timestamp("scraped_at").defaultNow(),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  imageCount: integer("image_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const propertyImages = pgTable("property_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => scrapedProperties.id),
  
  originalUrl: varchar("original_url").notNull(),
  imageUrl: varchar("image_url").notNull(), // URL procesada/optimizada
  altText: varchar("alt_text"),
  caption: varchar("caption"),
  
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"),
  
  isFeatured: boolean("is_featured").default(false),
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const scrapingJobs = pgTable("scraping_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  websiteId: varchar("website_id").notNull().references(() => scrapedWebsites.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  status: varchar("status").default("PENDING").notNull(), // PENDING, RUNNING, COMPLETED, FAILED
  jobType: varchar("job_type").default("FULL_SCRAPE").notNull(), // FULL_SCRAPE, INCREMENTAL, DISCOVERY
  
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Results
  pagesScraped: integer("pages_scraped").default(0),
  propertiesFound: integer("properties_found").default(0),
  propertiesAdded: integer("properties_added").default(0),
  propertiesUpdated: integer("properties_updated").default(0),
  
  // Error handling
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),
  
  // Metadata
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
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
}).partial();

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

export const insertScrapedWebsiteSchema = createInsertSchema(scrapedWebsites).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertScrapedPropertySchema = createInsertSchema(scrapedProperties).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPropertyImageSchema = createInsertSchema(propertyImages).omit({
  id: true,
  createdAt: true,
});

export const insertScrapingJobSchema = createInsertSchema(scrapingJobs).omit({
  id: true,
  createdAt: true,
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
export type InsertScrapedWebsite = z.infer<typeof insertScrapedWebsiteSchema>;
export type ScrapedWebsite = typeof scrapedWebsites.$inferSelect;
export type InsertScrapedProperty = z.infer<typeof insertScrapedPropertySchema>;
export type ScrapedProperty = typeof scrapedProperties.$inferSelect;
export type InsertPropertyImage = z.infer<typeof insertPropertyImageSchema>;
export type PropertyImage = typeof propertyImages.$inferSelect;
export type InsertScrapingJob = z.infer<typeof insertScrapingJobSchema>;
export type ScrapingJob = typeof scrapingJobs.$inferSelect;
