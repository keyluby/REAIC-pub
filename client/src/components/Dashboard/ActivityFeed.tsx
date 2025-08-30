import { Card, CardContent } from "@/components/ui/card";
import { UserPlus, MessageCircle, CalendarPlus } from "lucide-react";

const mockActivities = [
  {
    id: "1",
    type: "new_lead",
    icon: UserPlus,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    title: "Sarah Johnson became a new lead",
    description: "Interested in 3-bedroom apartments in Downtown",
    time: "2 minutes ago",
  },
  {
    id: "2",
    type: "ai_response",
    icon: MessageCircle,
    color: "text-primary",
    bgColor: "bg-primary/10",
    title: "AI responded to Mike Chen",
    description: "Sent 3 property recommendations based on budget",
    time: "5 minutes ago",
  },
  {
    id: "3",
    type: "appointment",
    icon: CalendarPlus,
    color: "text-accent",
    bgColor: "bg-accent/10",
    title: "Appointment scheduled with Emma Rodriguez",
    description: "Property viewing tomorrow at 2:00 PM",
    time: "15 minutes ago",
  },
];

export default function ActivityFeed() {
  return (
    <Card>
      <CardContent className="p-0">
        {mockActivities.map((activity, index) => {
          const Icon = activity.icon;
          return (
            <div
              key={activity.id}
              className={`p-4 ${index < mockActivities.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="flex items-start space-x-3">
                <div className={`w-8 h-8 ${activity.bgColor} rounded-full flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`${activity.color} text-sm w-4 h-4`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground" data-testid={`activity-title-${activity.id}`}>
                    {activity.title}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid={`activity-description-${activity.id}`}>
                    {activity.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1" data-testid={`activity-time-${activity.id}`}>
                    {activity.time}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
