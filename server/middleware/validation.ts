import { Request, Response, NextFunction } from 'express';
import { 
  insertUserSettingsSchema,
  insertWhatsappInstanceSchema,
  insertConversationSchema,
  insertMessageSchema,
  insertAppointmentSchema,
  insertLeadSchema
} from '@shared/schema';

const schemas = {
  userSettings: insertUserSettingsSchema,
  whatsappInstance: insertWhatsappInstanceSchema,
  conversation: insertConversationSchema,
  message: insertMessageSchema,
  appointment: insertAppointmentSchema,
  lead: insertLeadSchema,
};

export function validateRequest(schemaName: keyof typeof schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = schemas[schemaName];
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({
          message: 'Validation error',
          errors: result.error.errors,
        });
      }
      
      req.body = result.data;
      next();
    } catch (error) {
      res.status(400).json({ message: 'Invalid request data' });
    }
  };
}
