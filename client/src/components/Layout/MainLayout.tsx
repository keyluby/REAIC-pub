import { useState } from "react";
import Sidebar from "./Sidebar";
import ChatInterface from "@/components/Chat/ChatInterface";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showChat, setShowChat] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />
      
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 ${showChat ? 'w-2/3' : 'w-full'} overflow-auto`}>
          {children}
        </div>
        
        {showChat && (
          <div className="w-1/3 border-l border-border">
            <ChatInterface onClose={() => setShowChat(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
