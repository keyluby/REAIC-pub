import nodemailer from 'nodemailer';

export class NotificationService {
  private emailTransporter: any;

  constructor() {
    this.setupEmailTransporter();
  }

  private setupEmailTransporter() {
    this.emailTransporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendAppointmentNotification(
    agentEmail: string,
    appointmentData: any,
    conversationSummary: string
  ) {
    try {
      const emailTemplate = this.generateAppointmentEmailTemplate(appointmentData, conversationSummary);
      
      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@realestate-ai.com',
        to: agentEmail,
        subject: `Nueva Cita Agendada - ${appointmentData.clientName}`,
        html: emailTemplate,
      });
    } catch (error) {
      console.error('Error sending appointment notification:', error);
    }
  }

  private generateAppointmentEmailTemplate(appointmentData: any, conversationSummary: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">Nueva Cita Agendada</h2>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Cliente:</strong> ${appointmentData.clientName}</p>
          <p><strong>Teléfono:</strong> ${appointmentData.clientPhone}</p>
          <p><strong>Email:</strong> ${appointmentData.clientEmail || 'No proporcionado'}</p>
          <p><strong>Fecha:</strong> ${new Date(appointmentData.scheduledAt).toLocaleString('es-ES')}</p>
          <p><strong>Duración:</strong> ${appointmentData.duration} minutos</p>
          <p><strong>Ubicación:</strong> ${appointmentData.location || 'Por definir'}</p>
        </div>
        
        <h3 style="color: #1e40af;">Resumen de Conversación:</h3>
        <div style="background: #fff; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px;">
          ${conversationSummary.replace(/\n/g, '<br>')}
        </div>
        
        <p style="margin-top: 20px; color: #64748b; font-size: 14px;">
          Esta cita fue agendada automáticamente por el asistente de IA.
        </p>
      </div>
    `;
  }

  async scheduleReminder(appointmentId: string, reminderType: string, delay: number) {
    // This would integrate with Bull queue for scheduling reminders
    console.log(`Scheduling ${reminderType} reminder for appointment ${appointmentId} in ${delay}ms`);
  }

  async escalateToHuman(conversationId: string, reason: string, agentEmail?: string) {
    try {
      if (agentEmail) {
        await this.emailTransporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@realestate-ai.com',
          to: agentEmail,
          subject: `Escalación de Conversación - ${conversationId}`,
          html: `
            <h3>Conversación Escalada a Humano</h3>
            <p><strong>ID de Conversación:</strong> ${conversationId}</p>
            <p><strong>Motivo:</strong> ${reason}</p>
            <p>El cliente ha solicitado hablar con una persona real. Por favor, revisa la conversación y toma el control.</p>
          `,
        });
      }

      // Notify via WebSocket if available
      const wss = (global as any).wss;
      if (wss) {
        wss.clients.forEach((client: any) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({
              type: 'conversation_escalated',
              conversationId,
              reason,
            }));
          }
        });
      }
    } catch (error) {
      console.error('Error escalating to human:', error);
    }
  }
}

export const notificationService = new NotificationService();
