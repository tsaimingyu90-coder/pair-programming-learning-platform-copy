import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    console.log('[AuthProvider] Starting auth check...');
    checkAppState();
  }, []);

  const checkAppState = async () => {
    console.log('[AuthContext] checkAppState started', { appId: appParams.appId, hasToken: !!appParams.token });
    
    // CRITICAL: Force stop loading after 3 seconds even if requests haven't completed
    const forceStopLoading = setTimeout(() => {
      console.warn('[AuthContext] Force stopping loading states');
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
    }, 3000);
    
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token,
        interceptResponses: true
      });
      
      const publicSettings = await Promise.race([
        appClient.get(`/prod/public-settings/by-id/${appParams.appId}`),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 5000)
        )
      ]);
      
      console.log('[AuthContext] Public settings loaded:', publicSettings);
      setAppPublicSettings(publicSettings);
      
      if (appParams.token) {
        console.log('[AuthContext] Token found, checking user auth...');
        await checkUserAuth();
      } else {
        console.log('[AuthContext] No token, skipping auth check');
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
      }
      
      clearTimeout(forceStopLoading);
      setIsLoadingPublicSettings(false);
    } catch (appError) {
      console.error('App state check failed:', appError);
      clearTimeout(forceStopLoading);
      
      if (appError.message === 'timeout') {
        console.warn('App settings check timed out');
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        return;
      }
      
      if (appError.status === 403 && appError.data?.extra_data?.reason) {
        const reason = appError.data.extra_data.reason;
        if (reason === 'auth_required') {
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        } else if (reason === 'user_not_registered') {
          setAuthError({ type: 'user_not_registered', message: 'User not registered' });
        } else {
          setAuthError({ type: reason, message: appError.message });
        }
      } else {
        setAuthError({ type: 'unknown', message: appError.message || 'Failed to load app' });
      }
      
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    console.log('[AuthContext] checkUserAuth started');
    try {
      setIsLoadingAuth(true);
      const currentUser = await Promise.race([
        base44.auth.me(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 5000)
        )
      ]);
      console.log('[AuthContext] User auth successful:', currentUser);
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      
      if (error.message === 'timeout') {
        console.warn('User auth check timed out');
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};