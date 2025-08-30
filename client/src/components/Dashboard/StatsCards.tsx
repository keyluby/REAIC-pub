import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, UserPlus, Calendar, TrendingUp } from "lucide-react";

export default function StatsCards() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-muted rounded mb-2"></div>
                <div className="h-8 bg-muted rounded mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statsData = [
    {
      title: "Active Conversations",
      value: stats?.activeConversations || 0,
      icon: MessageCircle,
      color: "text-primary",
      bgColor: "bg-primary/10",
      change: "+12% from yesterday",
      positive: true,
    },
    {
      title: "New Leads",
      value: stats?.newLeads || 0,
      icon: UserPlus,
      color: "text-accent",
      bgColor: "bg-accent/10",
      change: "+3 from yesterday",
      positive: true,
    },
    {
      title: "Appointments",
      value: stats?.scheduledAppointments || 0,
      icon: Calendar,
      color: "text-green-600",
      bgColor: "bg-green-500/10",
      change: `${stats?.todayAppointments || 0} scheduled today`,
      positive: null,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {statsData.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold text-foreground" data-testid={`stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
                    {stat.value}
                  </p>
                </div>
                <div className={`w-12 h-12 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                  <Icon className={`${stat.color} text-xl w-6 h-6`} />
                </div>
              </div>
              <p className={`text-sm mt-2 ${stat.positive === true ? 'text-green-600' : stat.positive === false ? 'text-red-600' : 'text-muted-foreground'}`}>
                {stat.positive === true && <TrendingUp className="inline w-3 h-3 mr-1" />}
                {stat.change}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
