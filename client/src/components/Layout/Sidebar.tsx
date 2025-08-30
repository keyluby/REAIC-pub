import { Link, useLocation } from "wouter";
import { 
  BarChart3, 
  MessageCircle, 
  Building, 
  Users, 
  Calendar, 
  Settings,
  Menu,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();

  const navigation = [
    { name: "Dashboard", href: "/", icon: BarChart3, current: location === "/" },
    { name: "Conversations", href: "/conversations", icon: MessageCircle, current: location === "/conversations", badge: "3" },
    { name: "Properties", href: "/properties", icon: Building, current: location === "/properties" },
    { name: "Leads", href: "/leads", icon: Users, current: location === "/leads" },
    { name: "Appointments", href: "/appointments", icon: Calendar, current: location === "/appointments" },
  ];

  return (
    <div className={`${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'} bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-sidebar-border">
        <div className={`flex items-center space-x-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Building className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="transition-opacity duration-300">
              <h1 className="text-lg font-semibold text-sidebar-foreground">RealEstate AI</h1>
              <p className="text-xs text-muted-foreground">Assistant</p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="hover:bg-sidebar-accent"
          data-testid="button-toggle-sidebar"
        >
          <Menu className="w-4 h-4 text-sidebar-foreground" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.name} href={item.href}>
              <a
                className={`
                  flex items-center space-x-3 p-3 rounded-lg transition-colors
                  ${item.current 
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground' 
                    : 'hover:bg-sidebar-accent text-sidebar-foreground hover:text-sidebar-accent-foreground'
                  }
                  ${collapsed ? 'justify-center' : ''}
                `}
                data-testid={`link-${item.name.toLowerCase()}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="transition-opacity duration-300">{item.name}</span>
                    {item.badge && (
                      <Badge 
                        variant="secondary" 
                        className="ml-auto bg-accent text-accent-foreground text-xs"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </a>
            </Link>
          );
        })}

        {/* WhatsApp Status */}
        <div className={`flex items-center space-x-3 p-3 rounded-lg ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex items-center space-x-2">
            <i className="fab fa-whatsapp text-green-500 text-lg"></i>
            {!collapsed && (
              <>
                <span className="text-sidebar-foreground">WhatsApp</span>
                <span className="ml-auto w-3 h-3 bg-green-500 rounded-full online-indicator"></span>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <Link href="/settings">
          <a
            className={`flex items-center space-x-3 p-3 rounded-lg hover:bg-sidebar-accent transition-colors ${collapsed ? 'justify-center' : ''}`}
            data-testid="link-settings"
          >
            <Settings className="w-5 h-5 text-sidebar-foreground" />
            {!collapsed && <span className="text-sidebar-foreground">Settings</span>}
          </a>
        </Link>

        {/* User Profile */}
        <div className={`flex items-center space-x-3 p-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center flex-shrink-0">
            {user?.profileImageUrl ? (
              <img 
                src={user.profileImageUrl} 
                alt="Profile" 
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-sidebar-primary-foreground" />
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.firstName || user?.email || 'User'}
              </div>
              <div className="text-xs text-muted-foreground">Pro Plan</div>
            </div>
          )}
        </div>

        {/* Logout */}
        {!collapsed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = '/api/logout'}
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
            data-testid="button-logout"
          >
            Logout
          </Button>
        )}
      </div>
    </div>
  );
}
