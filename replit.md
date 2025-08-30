# RealEstate AI Assistant

## Overview

RealEstate AI Assistant is a comprehensive SAAS platform that automates real estate WhatsApp conversations using AI. The application enables real estate agents to manage leads, schedule appointments, and handle property inquiries through an intelligent WhatsApp bot integration. The system processes incoming messages, provides automated responses using OpenAI's GPT model, and escalates conversations to human agents when needed.

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

### AI Integration
OpenAI GPT-5 powers the conversational AI with context-aware responses:

- **Message Processing**: Intelligent buffering system to combine rapid messages
- **Context Management**: Conversation history maintenance for coherent responses
- **Response Humanization**: Natural delay patterns and message chunking
- **Escalation Logic**: Automatic handoff to human agents based on conversation complexity

### WhatsApp Integration
Evolution API integration for WhatsApp Web automation:

- **Multi-Instance Support**: Multiple WhatsApp accounts per user
- **QR Code Authentication**: Secure WhatsApp Web connection
- **Webhook Processing**: Real-time message receipt and status updates
- **Media Handling**: Support for images, documents, and voice messages

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