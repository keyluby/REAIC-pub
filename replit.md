# RealEstate AI Assistant

## Overview

RealEstate AI Assistant is a comprehensive SAAS platform that automates real estate WhatsApp conversations using AI. The application enables real estate agents to manage leads, schedule appointments, and handle property inquiries through an intelligent WhatsApp bot integration. The system features an advanced web scraping infrastructure that automatically extracts and maintains property data from real estate websites, providing comprehensive property search capabilities with automated responses using OpenAI's GPT model.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client-side is built with React 18 and TypeScript, using a component-based architecture with shadcn/ui components for consistent styling. The frontend implements:

- **Routing**: Wouter-based client-side routing with protected routes
- **State Management**: TanStack Query for server state management and caching
- **UI Framework**: Custom component library built on Radix UI primitives with Tailwind CSS
- **Real-time Communication**: WebSocket integration for live message updates
- **Responsive Design**: Mobile-first approach with adaptive layouts

### Backend Architecture
The server follows an Express.js-based REST API architecture with modular separation of concerns:

- **Authentication**: Replit OIDC integration with passport.js strategy
- **Controllers**: Domain-specific request handlers (WhatsApp, CRM, appointments)
- **Services**: Business logic abstraction layer for external API integrations
- **Middleware**: Request validation using Zod schemas and rate limiting
- **WebSocket Server**: Real-time communication for live conversation updates

### Database Design
PostgreSQL database with Drizzle ORM providing type-safe database operations:

- **User Management**: User profiles, settings, and subscription tiers
- **WhatsApp Integration**: Instance management, conversations, and message history  
- **CRM Features**: Leads tracking, property management, and appointment scheduling
- **Session Management**: Secure session storage for authentication
- **Web Scraping System**: Scraped websites configuration, property data storage, and scraping job management
  - `scraped_websites`: Website configurations and scraping settings
  - `scraped_properties`: Extracted property data with comprehensive details
  - `property_images`: Property image galleries with featured image support
  - `scraping_jobs`: Automated scraping job tracking and status management

### AI Integration
OpenAI GPT-5 powers the conversational AI with context-aware responses:

- **Message Processing**: Intelligent buffering system to combine rapid messages
- **Context Management**: Conversation history maintenance for coherent responses
- **Response Humanization**: Natural delay patterns and message chunking
- **Escalation Logic**: Automatic handoff to human agents based on conversation complexity
- **Intelligent Property Search**: Prioritizes internal scraped data over external APIs
- **Dynamic Data Source Selection**: Automatically uses internal database when web scraping is configured, falls back to AlterEstate API when needed

### WhatsApp Integration
Evolution API integration for WhatsApp Web automation:

- **Multi-Instance Support**: Multiple WhatsApp accounts per user
- **QR Code Authentication**: Secure WhatsApp Web connection
- **Webhook Processing**: Real-time message receipt and status updates
- **Media Handling**: Support for images, documents, and voice messages
- **Enhanced Interactive Messages**: Multiple strategies for button messages with improved fallbacks
- **Property Carousels**: Rich media property presentations with interactive elements

### Web Scraping System
Advanced automated web scraping infrastructure for property data extraction:

- **Intelligent Site Analysis**: Automatic detection of property listing patterns and CSS selectors
- **Multi-Source Support**: Configurable scraping of multiple real estate websites per user
- **Automated Property Detection**: Smart identification of property links and data extraction
- **Deduplication System**: URL-based hash system prevents duplicate property processing
- **Periodic Scraping**: Automated scheduling system with configurable intervals
- **Image Gallery Support**: Extraction and storage of property images with featured image detection
- **Property Search Engine**: Intelligent search with natural language query parsing
- **Data Enrichment**: Automatic categorization and standardization of property information

## External Dependencies

### Core Infrastructure
- **Neon Database**: Serverless PostgreSQL database hosting
- **Replit Auth**: OpenID Connect authentication provider
- **Evolution API**: WhatsApp Web automation service

### AI and Communication
- **OpenAI API**: GPT-5 model for conversational AI responses
- **WebSocket Server**: Real-time bidirectional communication

### Real Estate Integration
- **AlterEstate API**: Property listings and CRM integration
- **Google Calendar API**: Appointment scheduling and availability management
- **Cal.com API**: Alternative calendar booking system

### Email and Notifications
- **SMTP Service**: Email notifications for appointments and alerts
- **Connect-PG-Simple**: PostgreSQL session store for Express sessions

### Development and Monitoring
- **Vite**: Frontend build tool with HMR and development server
- **TypeScript**: Type safety across the entire application stack
- **Tailwind CSS**: Utility-first CSS framework for rapid UI development