/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { ToastProvider } from './components/ToastProvider';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginScreen } from './components/LoginScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { ParentPortal } from './components/ParentPortal';
import { supabase } from './lib/supabase';
import {
  linkAccountAndResolveSession,
  ResolvedUserRole,
} from './lib/dataService';

type PortalSession = { role: 'none' } | ResolvedUserRole;

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<PortalSession>({ role: 'none' });

  useEffect(() => {
    let active = true;

    const bootstrapSession = async () => {
      try {
        const {
          data: { session: supaSession },
        } = await supabase.auth.getSession();

        if (supaSession && active) {
          const resolved = await linkAccountAndResolveSession();
          if (active) {
            setSession(resolved);
          }
        }
      } catch (err) {
        console.error('Session initialization error:', err);
        if (active) {
          setSession({ role: 'none' });
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    bootstrapSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setSession({ role: 'none' });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Supabase signOut error:', error);
    }
    setSession({ role: 'none' });
  };

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        {isLoading ? (
          <LoadingScreen />
        ) : session.role === 'admin' ? (
          <AdminDashboard onLogout={handleLogout} />
        ) : session.role === 'parent' ? (
          <ParentPortal
            studentId={session.studentId}
            onLogout={handleLogout}
          />
        ) : (
          <LoginScreen onAuthenticated={(resolved) => setSession(resolved)} />
        )}
      </ToastProvider>
    </MotionConfig>
  );
}
