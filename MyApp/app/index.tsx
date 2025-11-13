import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Index() {
  const [state, setState] = useState<'loading' | 'login' | 'setup' | 'tabs'>('loading');

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      if (!session) {
        setState('login');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('onboarded')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        // If we can’t read, don’t block—send to setup
        setState('setup');
        return;
      }

      setState(profile?.onboarded === true ? 'tabs' : 'setup');
    })();
  }, []);

  if (state === 'loading') return null; // or a splash

  if (state === 'login') return <Redirect href="/login" />;
  if (state === 'setup') return <Redirect href="/setup" />;
  return <Redirect href="/(tabs)" />;
}
