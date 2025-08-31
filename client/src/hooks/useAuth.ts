import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  // Temporary bypass for testing - remove this after demo
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/settings-test"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  return {
    user: user || { id: "test-user", email: "test@example.com" },
    isLoading: false,
    isAuthenticated: true, // Bypass auth for testing
    error,
  };
}
