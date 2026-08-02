import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

console.log('[base44Client] Initializing with:', { 
  appId: appId ? appId.substring(0, 8) + '...' : null,
  hasToken: !!token,
  functionsVersion,
  appBaseUrl 
});

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

console.log('[base44Client] Client created successfully');