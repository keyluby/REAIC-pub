import { Request, Response } from 'express';
import { alterEstateService } from '../services/alterEstateService';
import { storage } from '../storage';

class CRMController {
  async getProperties(req: any, res: Response) {
    try {
      const userId = req.user.claims.sub;
      const settings = await storage.getUserSettings(userId);
      
      if (!settings?.alterEstateToken) {
        return res.status(400).json({ message: 'AlterEstate token not configured' });
      }

      const properties = await alterEstateService.getAllProperties(settings.alterEstateToken, req.query);
      res.json(properties);
    } catch (error) {
      console.error('Error fetching properties:', error);
      res.status(500).json({ message: 'Failed to fetch properties' });
    }
  }

  async getPropertyDetail(req: any, res: Response) {
    try {
      const userId = req.user.claims.sub;
      const { slug } = req.params;
      const settings = await storage.getUserSettings(userId);
      
      if (!settings?.alterEstateToken) {
        return res.status(400).json({ message: 'AlterEstate token not configured' });
      }

      const property = await alterEstateService.getPropertyDetail(settings.alterEstateToken, slug);
      res.json(property);
    } catch (error) {
      console.error('Error fetching property detail:', error);
      res.status(500).json({ message: 'Failed to fetch property detail' });
    }
  }

  async createLead(req: any, res: Response) {
    try {
      const userId = req.user.claims.sub;
      const settings = await storage.getUserSettings(userId);
      
      if (!settings?.alterEstateToken) {
        return res.status(400).json({ message: 'AlterEstate token not configured' });
      }

      // Create lead in AlterEstate
      const alterEstateLead = await alterEstateService.createLead(settings.alterEstateToken, req.body);
      
      // Store lead locally
      const lead = await storage.createLead({
        userId,
        conversationId: req.body.conversationId,
        fullName: req.body.fullName,
        phone: req.body.phone,
        email: req.body.email,
        interests: req.body.interests,
        budget: req.body.budget,
        budgetCurrency: req.body.budgetCurrency,
        preferredLocation: req.body.preferredLocation,
        listingType: req.body.listingType,
        alterEstateLeadId: alterEstateLead.id,
      });

      res.json(lead);
    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(500).json({ message: 'Failed to create lead' });
    }
  }

  async getCities(req: any, res: Response) {
    try {
      const userId = req.user.claims.sub;
      const settings = await storage.getUserSettings(userId);
      
      if (!settings?.alterEstateToken) {
        return res.status(400).json({ message: 'AlterEstate token not configured' });
      }

      const cities = await alterEstateService.getCities(settings.alterEstateToken, req.query.countryId);
      res.json(cities);
    } catch (error) {
      console.error('Error fetching cities:', error);
      res.status(500).json({ message: 'Failed to fetch cities' });
    }
  }

  async getSectors(req: any, res: Response) {
    try {
      const userId = req.user.claims.sub;
      const { cityId } = req.params;
      const settings = await storage.getUserSettings(userId);
      
      if (!settings?.alterEstateToken) {
        return res.status(400).json({ message: 'AlterEstate token not configured' });
      }

      const sectors = await alterEstateService.getSectors(settings.alterEstateToken, parseInt(cityId));
      res.json(sectors);
    } catch (error) {
      console.error('Error fetching sectors:', error);
      res.status(500).json({ message: 'Failed to fetch sectors' });
    }
  }

  async getAgents(req: any, res: Response) {
    try {
      const userId = req.user.claims.sub;
      const settings = await storage.getUserSettings(userId);
      
      if (!settings?.alterEstateToken) {
        return res.status(400).json({ message: 'AlterEstate token not configured' });
      }

      const agents = await alterEstateService.getAgents(settings.alterEstateToken);
      res.json(agents);
    } catch (error) {
      console.error('Error fetching agents:', error);
      res.status(500).json({ message: 'Failed to fetch agents' });
    }
  }
}

export const crmController = new CRMController();
