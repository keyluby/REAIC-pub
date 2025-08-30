import { Button } from "@/components/ui/button";
import StatsCards from "./StatsCards";
import PropertyGrid from "./PropertyGrid";
import ActivityFeed from "./ActivityFeed";

export default function DashboardOverview() {
  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-2 text-foreground">Dashboard Overview</h2>
        <p className="text-muted-foreground">
          Welcome back! Here's what's happening with your real estate business today.
        </p>
      </div>

      {/* Stats Cards */}
      <StatsCards />

      {/* Featured Properties */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-foreground">Featured Properties</h3>
          <Button variant="outline" size="sm" data-testid="button-view-all-properties">
            View All
          </Button>
        </div>
        <PropertyGrid />
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">Recent Activity</h3>
        <ActivityFeed />
      </div>
    </div>
  );
}
