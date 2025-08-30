import { Request, Response } from 'express';
import { calendarService } from '../services/calendarService';
import { notificationService } from '../services/notificationService';
import { storage } from '../storage';

class AppointmentController {
  async createAppointment(req: any, res: Response) {
    try {
      const userId = req.user.claims.sub;
      const appointmentData = req.body;

      // Create appointment in database
      const appointment = await storage.createAppointment({
        userId,
        ...appointmentData,
      });

      // Schedule in external calendar
      const calendarResult = await calendarService.scheduleAppointment(userId, appointmentData);

      // Get user for email notifications
      const user = await storage.getUser(userId);
      if (user?.email) {
        // Send notification to agent
        await notificationService.sendAppointmentNotification(
          user.email,
          appointment,
          req.body.conversationSummary || 'No conversation summary available'
        );
      }

      // Schedule reminders
      await notificationService.scheduleReminder(appointment.id, '24h', 24 * 60 * 60 * 1000);
      await notificationService.scheduleReminder(appointment.id, '2h', 2 * 60 * 60 * 1000);
      await notificationService.scheduleReminder(appointment.id, '30m', 30 * 60 * 1000);

      res.json({ appointment, calendarResult });
    } catch (error) {
      console.error('Error creating appointment:', error);
      res.status(500).json({ message: 'Failed to create appointment' });
    }
  }

  async getUserAppointments(req: any, res: Response) {
    try {
      const userId = req.user.claims.sub;
      const appointments = await storage.getUserAppointments(userId);
      res.json(appointments);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      res.status(500).json({ message: 'Failed to fetch appointments' });
    }
  }

  async updateStatus(req: any, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await storage.updateAppointmentStatus(id, status);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating appointment status:', error);
      res.status(500).json({ message: 'Failed to update appointment status' });
    }
  }
}

export const appointmentController = new AppointmentController();
